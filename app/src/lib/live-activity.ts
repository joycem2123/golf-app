/**
 * Live score on the Lock Screen and in the Dynamic Island (iOS Live Activities).
 *
 * While I'm playing in a live round, the app shows my match there and keeps it up to date as scores come
 * in (mine, or the group's through sync). When the round ends, the card shows the final result for a while
 * and then goes away. Each card's push token is saved so the server can update it while the app is closed.
 *
 * Everything here is a no-op where the native part isn't available (Android, the web, Expo Go and
 * TestFlight builds from before Live Activities were added), so it's safe to ship as an over-the-air update.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { playersIn } from '@/lib/edit-rights';
import { headline } from '@/lib/headline';
import { isMeId } from '@/lib/me';
import { matchOutcomes } from '@/lib/results';
import { courseFor, evaluate, isResult, shortCourseName } from '@/lib/round';
import { namesFor, teamName } from '@/lib/team-colors';
import type { RoundActivityProps } from '@/live-activity/round-activity';
import { useStore, type RoundRecord } from '@/store/store';
import { supabase } from '@/sync/supabase';
import { teamColor } from '@/theme';

type Instance = {
  getId(): string;
  update(props: RoundActivityProps, staleDate?: Date): Promise<void>;
  end(policy?: unknown, props?: RoundActivityProps, contentDate?: Date): Promise<void>;
  getPushToken(): Promise<string | null>;
  addPushTokenListener(l: (e: { activityId: string; pushToken: string }) => void): { remove(): void };
};
type Factory = { start(props: RoundActivityProps, url?: string, staleDate?: Date): Instance; getInstances(): Instance[] };

let factory: Factory | null | undefined;
/** The Live Activity type, or null when this build can't show Live Activities. */
function getFactory(): Factory | null {
  if (factory !== undefined) return factory;
  factory = null;
  if (Platform.OS !== 'ios') return factory;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require('expo') as { requireOptionalNativeModule: (n: string) => unknown };
    if (!requireOptionalNativeModule('ExpoWidgets')) return factory;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    factory = (require('@/live-activity/round-activity') as { default: Factory }).default;
  } catch {
    factory = null;
  }
  return factory;
}

export const liveActivitiesSupported = () => getFactory() !== null;

// ------------------------------------------------------------------ on/off (More → Live score on Lock Screen)

const OFF_KEY = 'liveActivity:off';
let off = false;
const prefListeners = new Set<(on: boolean) => void>();
const prefLoaded = AsyncStorage.getItem(OFF_KEY).then((v) => { off = v === '1'; }).catch(() => undefined);

export function useLiveActivityPref(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(!off);
  useEffect(() => {
    void prefLoaded.then(() => setOn(!off));
    prefListeners.add(setOn);
    return () => { prefListeners.delete(setOn); };
  }, []);
  return [on, (v: boolean) => {
    off = !v;
    void AsyncStorage.setItem(OFF_KEY, off ? '1' : '0').catch(() => undefined);
    prefListeners.forEach((l) => l(v));
    void sync();
  }];
}

// ------------------------------------------------------------------ what to show

const HOURS = 3600_000;

/** The live round I'm playing in right now (most recent first), and which game in it is mine. */
export function currentRound(rounds: RoundRecord[]): { r: RoundRecord; gi: number } | null {
  const st = useStore.getState();
  const mine = (id: string) => id === st.me || isMeId(id, st);
  const live = rounds
    .filter((r) => r.status === 'active' && Date.now() - r.createdAt < 18 * HOURS)
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const r of live) {
    const games = r.games.map((g, gi) => ({ g, gi })).filter(({ g }) => !(g.id ?? '').startsWith('side-') && playersIn(g).some(mine));
    if (games.length) return { r, gi: games[0].gi };
  }
  return null;
}

const firstNames = (s: string) => s.split(' & ').map((n) => n.trim().split(' ')[0]).join(' & ');

/** The card's content for game `gi` of round `r`. */
export function activityProps(r: RoundRecord, gi: number): RoundActivityProps | null {
  const results = evaluate(r);
  const res = results[gi];
  if (!res || !isResult(res)) return null;
  const st = useStore.getState();
  const e = r.eventId ? st.events.find((x) => x.id === r.eventId) : undefined;
  const h = headline(res, r.players);
  let course = '';
  try { course = shortCourseName(courseFor(r).name); } catch { /* course missing */ }
  const games = r.games.filter((g) => !(g.id ?? '').startsWith('side-')).length;
  const title = [e?.name ?? course, games > 1 ? `Match ${gi + 1}` : null].filter(Boolean).join(' · ') || 'Clutch Up';
  const thru = h.small;
  const done = res.finished;

  // Stroke play, skins and other games without two sides: just the top of the board.
  const m = matchOutcomes(r, results).find((x) => x.gi === gi);
  if (!m || h.board) {
    const top = h.board?.[0];
    const big = top ? `${top.pos === 'T1' ? 'Tied: ' : ''}${firstNames(top.name)} ${top.value}` : h.leader ? `${firstNames(h.leader)} ${h.big}` : h.big;
    return { title, aName: '', bName: '', aColor: '#2F6B4F', bColor: '#C9A227', aStatus: '', bStatus: '', lead: '', mine: '', big, thru, done };
  }

  const st2 = useStore.getState();
  const isMine = (ids: string[]) => ids.some((id) => id === st2.me || isMeId(id, st2));
  const mine = isMine(m.a.members) ? 'a' : isMine(m.b.members) ? 'b' : '';
  const teams = m.a.letter !== m.b.letter && !!r.teamOf && Object.keys(r.teamOf).length > 0;
  const names = namesFor(r, e);
  const aName = teams ? teamName(m.a.letter, names) : firstNames(m.a.names);
  const bName = teams ? teamName(m.b.letter, names) : firstNames(m.b.names);
  const aColor = teams ? teamColor(m.a.letter, r.teamColors ?? e?.teamColors).color : '#2F6B4F';
  const bColor = teams ? teamColor(m.b.letter, r.teamColors ?? e?.teamColors).color : '#C9A227';

  const margin = h.big.match(/(\d+) UP/)?.[1];
  let aStatus = '–';
  let bStatus = '–';
  let lead = '';
  if (done) {
    lead = m.winner === 'a' ? 'a' : m.winner === 'b' ? 'b' : '';
    aStatus = m.winner === 'halved' ? 'HALVED' : m.winner === 'a' ? 'WON' : 'LOST';
    bStatus = m.winner === 'halved' ? 'HALVED' : m.winner === 'b' ? 'WON' : 'LOST';
  } else if (h.side !== null && margin) {
    lead = h.side === 0 ? 'a' : 'b';
    aStatus = lead === 'a' ? `${margin} UP` : `${margin} DN`;
    bStatus = lead === 'b' ? `${margin} UP` : `${margin} DN`;
  } else if (thru !== 'Not started') {
    aStatus = 'AS';
    bStatus = 'AS';
  }
  const big = h.leader ? `${firstNames(h.leader)} ${h.big}` : h.big;
  return { title, aName, bName, aColor, bColor, aStatus, bStatus, lead, mine, big, thru, done };
}

// ------------------------------------------------------------------ keeping the card in step

let current: { roundId: string; gi: number; instance: Instance; last: string } | null = null;
let tokenSub: { remove(): void } | null = null;
let busy = false;

async function saveToken(roundId: string, gi: number, activityId: string, token: string | null, side: string) {
  if (!token) return;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await supabase.from('live_activity_tokens').upsert(
      { activity_id: activityId, user_id: data.session.user.id, round_id: roundId, game_index: gi, side, token, updated_at: new Date().toISOString() },
      { onConflict: 'activity_id' },
    );
  } catch {
    /* offline: the card still updates while the app is open */
  }
}

function watchToken(roundId: string, gi: number, instance: Instance, side: string) {
  tokenSub?.remove();
  tokenSub = null;
  try {
    void instance.getPushToken().then((t) => saveToken(roundId, gi, instance.getId(), t, side)).catch(() => undefined);
    tokenSub = instance.addPushTokenListener((ev) => void saveToken(roundId, gi, ev.activityId, ev.pushToken, side));
  } catch {
    /* push updates not available */
  }
}

async function endCurrent(final?: RoundActivityProps) {
  const c = current;
  current = null;
  tokenSub?.remove();
  tokenSub = null;
  if (!c) return;
  try {
    // A finished round stays up for a while so everyone sees the result; otherwise it goes straight away.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const policy = final ? (require('expo-widgets') as { after: (d: Date) => unknown }).after(new Date(Date.now() + 30 * 60_000)) : 'immediate';
    await c.instance.end(policy, final, new Date());
  } catch {
    /* already gone */
  }
  void supabase.from('live_activity_tokens').delete().eq('activity_id', c.instance.getId()).then(() => undefined, () => undefined);
}

/** Bring the card in line with the store: start, update or end it. */
export async function sync() {
  const f = getFactory();
  if (!f || busy) return;
  busy = true;
  try {
    await prefLoaded;
    const rounds = useStore.getState().rounds;

    // The round on the card finished (or was deleted): show the result, then let it go.
    if (current) {
      const r = rounds.find((x) => x.id === current!.roundId);
      if (!r || off) await endCurrent();
      else if (r.status === 'complete') await endCurrent(activityProps(r, current.gi) ?? undefined);
    }
    if (off) return;

    const pick = currentRound(rounds);
    if (current && (!pick || pick.r.id !== current.roundId || pick.gi !== current.gi)) await endCurrent();
    if (!pick) return;
    const props = activityProps(pick.r, pick.gi);
    if (!props) return;
    const json = JSON.stringify(props);
    const stale = new Date(Date.now() + 2 * HOURS);

    if (current) {
      if (json !== current.last) {
        current.last = json;
        await current.instance.update(props, stale);
      }
      return;
    }
    // iOS only lets the app start a card while it's on screen.
    if (AppState.currentState !== 'active') return;
    const instance = f.start(props, `clutchup://round/${pick.r.id}`, stale);
    current = { roundId: pick.r.id, gi: pick.gi, instance, last: json };
    watchToken(pick.r.id, pick.gi, instance, props.mine);
  } catch {
    /* Live Activities turned off in Settings, or too many running: carry on without */
  } finally {
    busy = false;
  }
}

// ------------------------------------------------------------------ updating everyone else's cards

/** What each match's card showed when this phone last told the server, by "roundId:gi". */
const told = new Map<string, string>();

/**
 * When scores change in a shared round I'm playing in, send the match's new card to the server, which
 * passes it on to the other players' phones (their cards update even with the app closed). This runs on
 * every build, so cards keep up even when the person scoring hasn't got the newest TestFlight build.
 */
async function tellOthers() {
  const st = useStore.getState();
  const mine = (id: string) => id === st.me || isMeId(id, st);
  for (const r of st.rounds) {
    if (!r.remote || r.remote.role === 'viewer' || Date.now() - r.createdAt > 18 * HOURS) continue;
    const owner = r.remote.role === 'owner';
    for (let gi = 0; gi < r.games.length; gi++) {
      const g = r.games[gi];
      if ((g.id ?? '').startsWith('side-') || !(owner || playersIn(g).some(mine))) continue;
      const props = activityProps(r, gi);
      if (!props) continue;
      const key = `${r.id}:${gi}`;
      const json = JSON.stringify({ ...props, mine: '' });
      const before = told.get(key);
      told.set(key, json);
      // The first look at a match only notes where it stands; changes after that are sent.
      if (before === undefined || before === json) continue;
      void supabase.functions.invoke('live-activity', { body: { roundId: r.id, gi, props: { ...props, mine: '' }, end: r.status === 'complete' } }).catch(() => undefined);
    }
  }
}

/** Call once from the root layout. */
export function useLiveActivity() {
  // Others' cards: on every build.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    void tellOthers();
    const unsub = useStore.subscribe((s, prev) => {
      if (s.rounds === prev.rounds || timer) return;
      timer = setTimeout(() => { timer = null; void tellOthers().catch(() => undefined); }, 1500);
    });
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, []);

  // My own card: only where this build can show one.
  useEffect(() => {
    const f = getFactory();
    if (!f) return;
    // After a restart: pick up a card left from last time (keep one, close any others).
    try {
      const [keep, ...extra] = f.getInstances();
      for (const x of extra) void x.end('immediate').catch(() => undefined);
      const pick = currentRound(useStore.getState().rounds);
      if (keep && pick) {
        current = { roundId: pick.r.id, gi: pick.gi, instance: keep, last: '' };
        watchToken(pick.r.id, pick.gi, keep, activityProps(pick.r, pick.gi)?.mine ?? '');
      } else if (keep) void keep.end('immediate').catch(() => undefined);
    } catch {
      /* nothing to recover */
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; void sync(); }, 800);
    };
    const unsub = useStore.subscribe((s, prev) => { if (s.rounds !== prev.rounds) soon(); });
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') soon(); });
    soon();
    return () => { unsub(); app.remove(); if (timer) clearTimeout(timer); };
  }, []);
}
