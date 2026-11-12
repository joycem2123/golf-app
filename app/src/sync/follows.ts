/**
 * Friends' matches: what my friends are playing (live, coming up and recently finished), following a
 * round, a match in it, an upcoming round or a whole event (it then shows on my Home screen), and alerts
 * when it changes.
 *
 * Opening a friend's round or event joins it as a viewer, so live scoring works like any shared round.
 * Opening isn't following: only what I follow appears on Home. The server checks we're friends.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
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

/** What can be followed: a round (gi omitted), a match in it (gi), an event (eventId), or an upcoming event round (eventId + planId). */
export type FollowTarget = { roundId: string; gi?: number } | { eventId: string; planId?: string };

/** A friend's round as the server sends it, made into a round the app can score and show. */
export interface FriendRound {
  round: RoundRecord;
  /** Account ids of my friends in it. */
  friends: string[];
  /** Which player in the round is which friend (account) where the server knows. */
  friendPlayers: { player_id: string; user_id: string }[];
  /** Already on my phone. */
  member: boolean;
}

export interface FriendEvent {
  event: EventRecord;
  friends: string[];
  member: boolean;
  /** Names of the event's players, by player id (not added to my own players list). */
  names: Record<string, string>;
  /** The event's rounds (for standings). */
  rounds: RoundRecord[];
}

interface State {
  rows: FollowRow[];
  rounds: FriendRound[];
  events: FriendEvent[];
  /** Friends' rounds and events I've opened to look at (not followed): kept off Home. */
  peek: string[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

export const useFollows = create<State>(() => ({ rows: [], rounds: [], events: [], peek: [], loaded: false, loading: false, error: null }));

const PEEK_KEY = 'follows:peek';
void AsyncStorage.getItem(PEEK_KEY).then((v) => { if (v) useFollows.setState({ peek: JSON.parse(v) as string[] }); }).catch(() => undefined);
function addPeek(id: string) {
  const peek = [...new Set([...useFollows.getState().peek, id])].slice(-200);
  useFollows.setState({ peek });
  void AsyncStorage.setItem(PEEK_KEY, JSON.stringify(peek)).catch(() => undefined);
}

const rowOf = (t: FollowTarget): Omit<FollowRow, 'follow' | 'notify'> =>
  'roundId' in t
    ? { round_id: t.roundId, game_index: t.gi ?? -1, event_id: '', plan_id: '' }
    : { round_id: '', game_index: -1, event_id: t.eventId, plan_id: t.planId ?? '' };
const key = (r: Omit<FollowRow, 'follow' | 'notify'>) => `${r.round_id}|${r.game_index}|${r.event_id}|${r.plan_id}`;

/** My follow settings for a round, match, event or upcoming round. */
export function followOf(rows: FollowRow[], t: FollowTarget): FollowRow | undefined {
  const k = key(rowOf(t));
  return rows.find((r) => key(r) === k);
}

/** Do I follow this round (itself, a match in it, or its event)? Used to put friends' rounds on Home. */
export function followsRound(rows: FollowRow[], r: Pick<RoundRecord, 'id' | 'eventId'>): boolean {
  return rows.some((f) => f.follow && (f.round_id === r.id || (!!r.eventId && f.event_id === r.eventId)));
}
export function followsEvent(rows: FollowRow[], eventId: string): boolean {
  return rows.some((f) => f.follow && f.event_id === eventId);
}

type RawRound = { id: string; status: 'active' | 'complete'; event_id: string | null; data: Record<string, unknown>; friends?: string[]; member?: boolean; friend_players?: { player_id: string; user_id: string }[]; scores: { key: string; hole: number; gross: number | null }[] };
type RawEvent = { id: string; data: Record<string, unknown> & { playerInfo?: { id: string; name: string }[] }; friends: string[]; member: boolean; rounds?: RawRound[] };

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
    const rounds = ((r.data ?? []) as RawRound[]).map((x) => ({ round: toRound(x), friends: x.friends ?? [], friendPlayers: x.friend_players ?? [], member: !!x.member }));
    const events = ((e.data ?? []) as RawEvent[]).map((x) => {
      const { playerInfo, ...rest } = x.data;
      const names = Object.fromEntries((playerInfo ?? []).map((p) => [p.id, p.name]));
      return { event: { ...(rest as unknown as EventRecord), id: x.id }, friends: x.friends ?? [], member: !!x.member, names, rounds: (x.rounds ?? []).map(toRound) };
    });
    useFollows.setState({ rounds, events, rows: f.error ? useFollows.getState().rows : ((f.data ?? []) as FollowRow[]), loaded: true });
  } catch (err) {
    useFollows.setState({ error: /fetch|network/i.test(String(err)) ? 'You’re offline. Friends’ matches show when you’re back online.' : 'Couldn’t load friends’ matches.' });
  } finally {
    useFollows.setState({ loading: false });
  }
}

/** Just my follow settings (Home uses them). */
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

/** Wait (briefly) until the round or event is on my phone; names and the rest keep loading behind. */
async function arrived(check: () => boolean, ms = 10_000) {
  const t0 = Date.now();
  while (!check() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 120));
  return check();
}

/** Put a friend's round on my phone (as a viewer) so it can be opened. */
async function bringRound(roundId: string) {
  if (useStore.getState().rounds.some((r) => r.id === roundId)) return;
  undelete(roundId);
  const { error } = await supabase.rpc('follow_round', { rid: roundId });
  if (error) throw new Error(error.message);
  void pullRound(roundId, 'viewer').catch(() => undefined);
  if (!(await arrived(() => useStore.getState().rounds.some((r) => r.id === roundId)))) throw new Error('Couldn’t open this round. Check your connection.');
}
async function bringEvent(eventId: string) {
  if (useStore.getState().events.some((e) => e.id === eventId)) return;
  undelete(eventId);
  const { error } = await supabase.rpc('follow_event', { eid: eventId });
  if (error) throw new Error(error.message);
  void pullEvent(eventId, 'viewer').catch(() => undefined);
  if (!(await arrived(() => useStore.getState().events.some((e) => e.id === eventId)))) throw new Error('Couldn’t open this event. Check your connection.');
}

/** Open a friend's round (live scoring or results) without following it. */
export async function viewRound(roundId: string) {
  const had = useStore.getState().rounds.some((r) => r.id === roundId);
  await bringRound(roundId);
  if (!had) addPeek(roundId);
}
/** Open a friend's event page without following it. */
export async function viewEvent(eventId: string) {
  const had = useStore.getState().events.some((e) => e.id === eventId);
  await bringEvent(eventId);
  if (!had) addPeek(eventId);
}

/** Follow (or stop following) a round, match, event or upcoming round: it comes onto, or leaves, my Home screen. */
export async function setFollow(t: FollowTarget, on: boolean) {
  const prev = followOf(useFollows.getState().rows, t);
  await saveRow({ ...rowOf(t), follow: on, notify: prev?.notify ?? false });
  if ('roundId' in t) {
    if (on) await bringRound(t.roundId);
  } else if (on) await bringEvent(t.eventId);
  markMembers();
}

export async function setNotify(t: FollowTarget, on: boolean) {
  const prev = followOf(useFollows.getState().rows, t);
  await saveRow({ ...rowOf(t), follow: prev?.follow ?? false, notify: on });
}

/** Keep "on my phone" flags in step after opening or following. */
function markMembers() {
  const st = useStore.getState();
  useFollows.setState((s) => ({
    rounds: s.rounds.map((x) => ({ ...x, member: st.rounds.some((r) => r.id === x.round.id) })),
    events: s.events.map((x) => ({ ...x, member: st.events.some((e) => e.id === x.event.id) })),
  }));
}

/** Which game in a followed round to open on (a match I follow), if any. */
export function followedGame(rows: FollowRow[], roundId: string): number | null {
  const f = rows.find((r) => r.round_id === roundId && r.follow && r.game_index >= 0);
  return f ? f.game_index : null;
}
