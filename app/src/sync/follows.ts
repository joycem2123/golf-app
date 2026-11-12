/**
 * Friends' matches: what my friends are playing (live, coming up and recently finished), following a
 * match (it joins my Home screen as a live card I can watch) and notifications when it changes.
 *
 * Following joins the round (or event) as a viewer, so it then syncs like any shared round. The server
 * checks we're friends. Notification switches are kept on the server, which sends the alerts.
 */
import { applyScoreEntry } from '@golf/engine';
import { create } from 'zustand';

import type { EventRecord, RoundRecord } from '@/store/store';
import { useStore } from '@/store/store';
import { pullEvent, pullRound } from '@/sync/sync';
import { supabase } from '@/sync/supabase';

export interface FollowRow {
  round_id: string;
  game_index: number;
  event_id: string;
  plan_id: string;
  follow: boolean;
  notify: boolean;
}

/** A friend's round as the server sends it, made into a round the app can score and show. */
export interface FriendRound {
  round: RoundRecord;
  /** Account ids of my friends playing in it. */
  friends: string[];
  /** Already on my phone (I play in it, or I follow it). */
  member: boolean;
}

export interface FriendEvent {
  event: EventRecord;
  friends: string[];
  member: boolean;
  /** Names of the event's players, by player id (not added to my own players list). */
  names: Record<string, string>;
}

interface State {
  rows: FollowRow[];
  rounds: FriendRound[];
  events: FriendEvent[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

export const useFollows = create<State>(() => ({ rows: [], rounds: [], events: [], loaded: false, loading: false, error: null }));

const key = (r: Pick<FollowRow, 'round_id' | 'game_index' | 'event_id' | 'plan_id'>) => `${r.round_id}|${r.game_index}|${r.event_id}|${r.plan_id}`;

/** The follow settings for a live match, or for an upcoming event round. */
export function followOf(rows: FollowRow[], t: { roundId?: string; gi?: number; eventId?: string; planId?: string }): FollowRow | undefined {
  const k = key({ round_id: t.roundId ?? '', game_index: t.gi ?? -1, event_id: t.roundId ? '' : (t.eventId ?? ''), plan_id: t.roundId ? '' : (t.planId ?? '') });
  return rows.find((r) => key(r) === k);
}

type RawRound = { id: string; status: 'active' | 'complete'; event_id: string | null; data: Record<string, unknown>; friends: string[]; member: boolean; scores: { key: string; hole: number; gross: number | null }[] };
type RawEvent = { id: string; data: Record<string, unknown> & { playerInfo?: { id: string; name: string; handicapIndex: number }[] }; friends: string[]; member: boolean };

function toRound(x: RawRound): RoundRecord {
  let ledger: RoundRecord['ledger'] = {};
  for (const s of x.scores ?? []) {
    if (s.gross === null) continue;
    ledger = applyScoreEntry(ledger, { key: s.key, hole: s.hole, gross: s.gross, enteredBy: 'server', enteredAt: 0 }).ledger;
  }
  return {
    ...(x.data as unknown as RoundRecord),
    id: x.id,
    eventId: x.event_id ?? (x.data as { eventId?: string }).eventId,
    ledger,
    stats: {},
    currentHole: 1,
    status: x.status,
    notices: [],
  };
}

/** Load my friends' rounds and events, and my follow settings. */
export async function loadFriendMatches() {
  if (useFollows.getState().loading) return;
  useFollows.setState({ loading: true, error: null });
  try {
    const [r, e, f] = await Promise.all([
      supabase.rpc('friend_rounds', { days: 21 }),
      supabase.rpc('friend_events'),
      supabase.from('match_follows').select('round_id, game_index, event_id, plan_id, follow, notify'),
    ]);
    if (r.error) throw new Error(r.error.message);
    const rounds = ((r.data ?? []) as RawRound[]).map((x) => ({ round: toRound(x), friends: x.friends ?? [], member: !!x.member }));
    const events = ((e.data ?? []) as RawEvent[]).map((x) => {
      const { playerInfo, ...rest } = x.data;
      const names = Object.fromEntries((playerInfo ?? []).map((p) => [p.id, p.name]));
      return { event: { ...(rest as unknown as EventRecord), id: x.id }, friends: x.friends ?? [], member: !!x.member, names };
    });
    useFollows.setState({ rounds, events, rows: (f.data ?? []) as FollowRow[], loaded: true });
  } catch (err) {
    useFollows.setState({ error: /fetch|network/i.test(String(err)) ? 'You’re offline. Friends’ matches show when you’re back online.' : 'Couldn’t load friends’ matches.' });
  } finally {
    useFollows.setState({ loading: false });
  }
}

/** Just my follow settings (Home uses them to show the match I follow in a friend's round). */
export async function loadFollowRows() {
  const { data, error } = await supabase.from('match_follows').select('round_id, game_index, event_id, plan_id, follow, notify');
  if (!error) useFollows.setState({ rows: (data ?? []) as FollowRow[] });
}

async function saveRow(row: FollowRow) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Sign in to follow friends’ matches.');
  const rows = useFollows.getState().rows.filter((r) => key(r) !== key(row));
  useFollows.setState({ rows: [...rows, row] });
  const { error } = await supabase.from('match_follows').upsert({ ...row, user_id: data.session.user.id });
  if (error) throw new Error(error.message);
}

const undelete = (id: string) => {
  const gone = useStore.getState().deleted ?? {};
  if (!gone[id]) return;
  const rest = { ...gone };
  delete rest[id];
  useStore.setState({ deleted: rest });
};

/** Follow (or stop following) a friend's live match: it comes onto, or leaves, my Home screen. */
export async function setFollowMatch(roundId: string, gi: number, on: boolean) {
  const prev = followOf(useFollows.getState().rows, { roundId, gi });
  await saveRow({ round_id: roundId, game_index: gi, event_id: '', plan_id: '', follow: on, notify: prev?.notify ?? false });
  if (on) {
    undelete(roundId);
    const { error } = await supabase.rpc('follow_round', { rid: roundId });
    if (error) throw new Error(error.message);
    await pullRound(roundId, 'viewer');
  } else if (!useFollows.getState().rows.some((r) => r.round_id === roundId && r.follow)) {
    // No longer following anything in it: take it off my phone (unless I'm part of it).
    const r = useStore.getState().rounds.find((x) => x.id === roundId);
    if (r?.remote?.role === 'viewer') useStore.getState().deleteRound(roundId, { now: true });
  }
  markMembers();
}

export async function setNotifyMatch(roundId: string, gi: number, on: boolean) {
  const prev = followOf(useFollows.getState().rows, { roundId, gi });
  await saveRow({ round_id: roundId, game_index: gi, event_id: '', plan_id: '', follow: prev?.follow ?? false, notify: on });
}

/** Follow a friend's upcoming event round: the event joins my phone, and its rounds show on Home as they start. */
export async function setFollowUpcoming(eventId: string, planId: string, on: boolean) {
  const prev = followOf(useFollows.getState().rows, { eventId, planId });
  await saveRow({ round_id: '', game_index: -1, event_id: eventId, plan_id: planId, follow: on, notify: prev?.notify ?? false });
  if (on) {
    undelete(eventId);
    const { error } = await supabase.rpc('follow_event', { eid: eventId });
    if (error) throw new Error(error.message);
    await pullEvent(eventId, 'viewer');
  } else if (!useFollows.getState().rows.some((r) => r.event_id === eventId && r.follow)) {
    const e = useStore.getState().events.find((x) => x.id === eventId);
    if (e?.remote?.role === 'viewer') useStore.getState().deleteEvent(eventId);
  }
  markMembers();
}

export async function setNotifyUpcoming(eventId: string, planId: string, on: boolean) {
  const prev = followOf(useFollows.getState().rows, { eventId, planId });
  await saveRow({ round_id: '', game_index: -1, event_id: eventId, plan_id: planId, follow: prev?.follow ?? false, notify: on });
}

/** Keep "on my phone" flags in step after following or unfollowing. */
function markMembers() {
  const st = useStore.getState();
  useFollows.setState((s) => ({
    rounds: s.rounds.map((x) => ({ ...x, member: st.rounds.some((r) => r.id === x.round.id) })),
    events: s.events.map((x) => ({ ...x, member: st.events.some((e) => e.id === x.event.id) })),
  }));
}

/** Which game in a followed round to open on (the one I follow), if any. */
export function followedGame(rows: FollowRow[], roundId: string): number | null {
  const f = rows.find((r) => r.round_id === roundId && r.follow && r.game_index >= 0);
  return f ? f.game_index : null;
}
