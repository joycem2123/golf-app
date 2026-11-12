/**
 * Offline-first sync with Supabase.
 *
 * The phone's own store is always the source of truth for the screen. When a
 * round is shared, every score goes into an outbox and is sent when there's
 * signal; scores from other scorekeepers arrive live and are merged with
 * "latest entry wins" (the group gets a notice when someone's score changes).
 */
import type { RealtimeChannel } from '@supabase/supabase-js';

import { evaluate, isResult, recordedMatches } from '@/lib/round';
import { UNDO_WINDOW_MS, useStore, type EventRecord, type Remote, type RoundRecord } from '@/store/store';
import { ensureSession } from './auth';
import { pullSharedCourses } from './courses';
import { notify } from './nudges';
import { supabase } from './supabase';

// ------------------------------------------------------------------ documents

type RoundDoc = Pick<RoundRecord, 'createdAt' | 'courseId' | 'players' | 'games' | 'statsEnabled' | 'eventId' | 'label' | 'teamOf' | 'teamColors' | 'teamNames' | 'stories' | 'course'>;

function roundDoc(r: RoundRecord): RoundDoc {
  return { createdAt: r.createdAt, courseId: r.courseId, players: r.players, games: r.games, statsEnabled: r.statsEnabled, eventId: r.eventId, label: r.label, teamOf: r.teamOf, teamColors: r.teamColors, teamNames: r.teamNames, stories: r.stories, course: r.course };
}

interface RoundRow {
  id: string;
  share_code: string;
  event_id: string | null;
  status: 'active' | 'complete';
  data: RoundDoc;
}

function roundFromRow(row: RoundRow, role: Remote['role']): RoundRecord {
  return {
    id: row.id,
    ...row.data,
    eventId: row.event_id ?? row.data.eventId,
    ledger: {},
    stats: {},
    currentHole: 1,
    status: row.status,
    notices: [],
    remote: { shareCode: row.share_code, role },
  };
}

type EventDoc = Omit<EventRecord, 'remote'> & { playerInfo: { id: string; name: string; handicapIndex: number; gender: 'M' | 'F' }[] };

function eventDoc(e: EventRecord): EventDoc {
  const { remote: _r, ...rest } = e;
  const saved = useStore.getState().players;
  return { ...rest, playerInfo: saved.filter((p) => e.playerIds.includes(p.id)) };
}

interface ScoreRow {
  round_id: string;
  key: string;
  hole: number;
  gross: number | null;
  entered_by: string;
  entered_at: number;
}

const toEntry = (s: ScoreRow) => ({ key: s.key, hole: s.hole, gross: s.gross, enteredBy: s.entered_by, enteredAt: Number(s.entered_at) });

async function myRole(table: 'round_members' | 'event_members', col: string, id: string): Promise<Remote['role']> {
  const { data: session } = await supabase.auth.getSession();
  const { data } = await supabase.from(table).select('role').eq(col, id).eq('user_id', session.session?.user.id ?? '').maybeSingle();
  return (data?.role as Remote['role']) ?? 'viewer';
}

// ------------------------------------------------------------------ share

/** Put a round online and return its share code. */
export async function shareRound(roundId: string): Promise<string> {
  await ensureSession();
  const st = useStore.getState();
  const r = st.rounds.find((x) => x.id === roundId);
  if (!r) throw new Error('Round not found');
  if (r.remote) return r.remote.shareCode;
  const ev = r.eventId ? st.events.find((e) => e.id === r.eventId) : undefined;
  const { data, error } = await supabase
    .from('rounds')
    .insert({ id: r.id, event_id: ev?.remote ? ev.id : null, data: roundDoc(r), status: r.status })
    .select('share_code')
    .single();
  if (error) throw new Error(error.message);
  st.setRoundRemote(r.id, { shareCode: data.share_code, role: 'owner' });
  // Upload any scores already entered.
  const existing = Object.values(r.ledger).map((e) => ({ roundId: r.id, key: e.key, hole: e.hole, gross: e.gross, enteredAt: e.enteredAt }));
  useStore.setState((s) => ({ outbox: [...s.outbox, ...existing] }));
  void flush();
  return data.share_code;
}

/** Put an event online (and all of its rounds) and return its share code. */
export async function shareEvent(eventId: string): Promise<string> {
  await ensureSession();
  const st = useStore.getState();
  const e = st.events.find((x) => x.id === eventId);
  if (!e) throw new Error('Event not found');
  if (e.remote) return e.remote.shareCode;
  const { data, error } = await supabase.from('events').insert({ id: e.id, data: eventDoc(e) }).select('share_code').single();
  if (error) throw new Error(error.message);
  st.setEventRemote(e.id, { shareCode: data.share_code, role: 'owner' });
  for (const r of useStore.getState().rounds.filter((x) => x.eventId === e.id && !x.remote)) await shareRound(r.id);
  return data.share_code;
}

/** Called after creating a round: rounds in a shared event go online automatically. */
export async function autoShare(roundId: string) {
  const st = useStore.getState();
  const r = st.rounds.find((x) => x.id === roundId);
  const ev = r?.eventId ? st.events.find((e) => e.id === r.eventId) : undefined;
  if (ev?.remote && ev.remote.role !== 'viewer') await shareRound(roundId).catch(() => undefined);
}

// ------------------------------------------------------------------ join

export async function pullRound(roundId: string, role?: Remote['role']) {
  const [{ data: row, error }, { data: scores }] = await Promise.all([
    supabase.from('rounds').select('id, share_code, event_id, status, data').eq('id', roundId).maybeSingle(),
    supabase.from('scores').select('*').eq('round_id', roundId),
  ]);
  if (!row) {
    // Gone from the server (the owner deleted it): drop my unfinished copy of someone else's round.
    const local = useStore.getState().rounds.find((r) => r.id === roundId);
    if (!error && local?.remote && local.remote.role !== 'owner' && local.status !== 'complete') useStore.getState().deleteRound(roundId);
    return;
  }
  const st = useStore.getState();
  const local = st.rounds.find((r) => r.id === roundId);
  const resolvedRole = role ?? local?.remote?.role ?? (await myRole('round_members', 'round_id', roundId));
  st.upsertRemoteRound(roundFromRow(row as RoundRow, resolvedRole));
  if (scores?.length) st.applyRemoteScores(roundId, (scores as ScoreRow[]).map(toEntry));
  // Someone else finished it: put the results in my records too.
  const now = useStore.getState();
  const r = now.rounds.find((x) => x.id === roundId);
  if (r?.status === 'complete' && !now.history.some((m) => m.eventId === roundId)) {
    try {
      now.recordRemoteResults(roundId, recordedMatches(r, evaluate(r).filter(isResult)));
    } catch {
      /* course or game missing on this phone */
    }
  }
  await loadNames((scores as ScoreRow[] | null)?.map((s) => s.entered_by) ?? []);
}

export async function pullEvent(eventId: string, role?: Remote['role']) {
  const { data: row } = await supabase.from('events').select('id, share_code, data').eq('id', eventId).maybeSingle();
  if (!row) return;
  const doc = row.data as EventDoc;
  const st = useStore.getState();
  for (const p of doc.playerInfo ?? []) if (!st.players.some((x) => x.id === p.id)) st.upsertPlayer(p);
  const { playerInfo: _p, ...e } = doc;
  const resolvedRole = role ?? st.events.find((x) => x.id === eventId)?.remote?.role ?? (await myRole('event_members', 'event_id', eventId));
  st.upsertRemoteEvent({ ...e, remote: { shareCode: row.share_code, role: resolvedRole } });
  const { data: rounds } = await supabase.from('rounds').select('id').eq('event_id', eventId);
  for (const r of rounds ?? []) if (!useStore.getState().deleted?.[r.id]) await pullRound(r.id, resolvedRole === 'owner' ? 'scorer' : resolvedRole);
}

/** Join a round or event with its 6-character code. */
export async function joinByCode(code: string, role: 'scorer' | 'viewer', name?: string): Promise<{ kind: 'round' | 'event'; id: string }> {
  await ensureSession();
  if (name?.trim()) {
    const { data } = await supabase.auth.getSession();
    const id = data.session!.user.id;
    await supabase.from('profiles').upsert({ id, display_name: name.trim() });
    useStore.getState().setName(id, name.trim());
  }
  const { data, error } = await supabase.rpc('join_by_code', { code: code.trim().toUpperCase(), as_role: role });
  if (error) throw new Error(error.message.includes('No round or event') ? 'No round or event has that code.' : error.message);
  const res = data as { kind: 'round' | 'event'; id: string };
  if (res.kind === 'round') await pullRound(res.id, role);
  else await pullEvent(res.id, role);
  return res;
}

// ------------------------------------------------------------------ playing together

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Account ids of the Clutch Up players among these player ids (not me). */
function accountIds(playerIds: string[]): string[] {
  const st = useStore.getState();
  const out = new Set<string>();
  for (const id of playerIds) {
    const uid = st.players.find((p) => p.id === id)?.userId ?? (UUID.test(id) ? id : undefined);
    if (uid && uid !== st.me) out.add(uid);
  }
  return [...out].sort();
}

const offline = (msg: string) => /fetch|network|timeout/i.test(msg);

/** What each round/event has already been shared with this session (so we don't ask again). */
const sharedWith = new Map<string, string>();
let sharing = false;

/**
 * Put my live rounds and events online for the Clutch Up players in them, so the game
 * shows up on their phones too. Only friends can be added (the server checks).
 */
export async function shareWithPlayers() {
  if (sharing) return;
  sharing = true;
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user || user.is_anonymous) return;
    for (const e of useStore.getState().events) {
      if (e.status === 'complete' || e.remote?.role === 'viewer') continue;
      const ids = accountIds([...e.playerIds, ...(e.schedule ?? []).flatMap((m) => [...m.sideA, ...m.sideB])]);
      const sig = ids.join(',');
      if (!ids.length || sharedWith.get(`e:${e.id}`) === sig) continue;
      try {
        if (!e.remote) await shareEvent(e.id);
        const { error } = await supabase.rpc('share_event_with', { eid: e.id, users: ids });
        if (!error || !offline(error.message)) sharedWith.set(`e:${e.id}`, sig);
      } catch {
        /* offline: try again later */
      }
    }
    for (const r of useStore.getState().rounds) {
      if (r.status === 'complete' || r.remote?.role === 'viewer') continue;
      const ids = accountIds(r.players.map((p) => p.id));
      const sig = ids.join(',');
      if (!ids.length || sharedWith.get(`r:${r.id}`) === sig) continue;
      try {
        if (!r.remote) await shareRound(r.id);
        const { error } = await supabase.rpc('share_round_with', { rid: r.id, users: ids });
        if (!error || !offline(error.message)) sharedWith.set(`r:${r.id}`, sig);
        // Let players who were just added know (the server only tells each person once).
        if (!error) notify({ kind: 'round', id: r.id });
      } catch {
        /* offline: try again later */
      }
    }
  } finally {
    sharing = false;
  }
}

/** Bring in every round and event I've been added to (and drop ones that were deleted). */
export async function pullMine() {
  void pullSharedCourses();
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return;
  const [rm, em] = await Promise.all([
    supabase.from('round_members').select('round_id, role').eq('user_id', uid),
    supabase.from('event_members').select('event_id, role').eq('user_id', uid),
  ]);
  if (rm.error || em.error) return;
  const st = useStore.getState();
  const gone = st.deleted ?? {};
  for (const m of em.data ?? []) if (!gone[m.event_id] && !st.events.some((e) => e.id === m.event_id)) await pullEvent(m.event_id, m.role as Remote['role']);
  for (const m of rm.data ?? []) if (!gone[m.round_id] && !useStore.getState().rounds.some((r) => r.id === m.round_id)) await pullRound(m.round_id, m.role as Remote['role']);
  // Someone else's unfinished round I can no longer see: check whether it was deleted.
  const roundIds = new Set((rm.data ?? []).map((m) => m.round_id as string));
  const eventIds = new Set((em.data ?? []).map((m) => m.event_id as string));
  for (const r of useStore.getState().rounds) {
    if (!r.remote || r.remote.role === 'owner' || r.status === 'complete' || roundIds.has(r.id) || (r.eventId && eventIds.has(r.eventId))) continue;
    await pullRound(r.id);
  }
}

let mineChannel: RealtimeChannel | null = null;

/** Hear straight away when someone adds me to a round or event. */
export function watchMine(uid: string | null) {
  if (mineChannel) {
    void supabase.removeChannel(mineChannel);
    mineChannel = null;
  }
  if (!uid) return;
  mineChannel = supabase
    .channel(`mine:${uid}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'round_members', filter: `user_id=eq.${uid}` }, (p) => {
      const row = p.new as { round_id: string; role: Remote['role'] };
      void pullRound(row.round_id, row.role);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'event_members', filter: `user_id=eq.${uid}` }, (p) => {
      const row = p.new as { event_id: string; role: Remote['role'] };
      void pullEvent(row.event_id, row.role);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') void pullMine();
    });
}

// ------------------------------------------------------------------ upload

let flushing = false;

/** Send queued scores and game changes. Safe to call any time; does nothing offline. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const claimedRounds = new Set<string>();

/**
 * Tell the server which player in this round is me, when that player's id isn't my account id
 * (playing without an account, or added before I signed up). Without it, my own match would be locked to me.
 */
export async function claimMe(roundId: string) {
  const st = useStore.getState();
  const r = st.rounds.find((x) => x.id === roundId);
  if (!r?.remote || !st.me) return;
  const mine = r.players.map((p) => p.id).filter((id) => !UUID_RE.test(id) && (id === st.myPlayerId || st.meAliases.includes(id)));
  const tag = `${roundId}:${mine.join(',')}`;
  if (claimedRounds.has(tag)) return;
  if (mine.length) {
    const { error } = await supabase.from('round_identities').upsert(mine.map((player_id) => ({ round_id: roundId, player_id })), { onConflict: 'round_id,player_id', ignoreDuplicates: true });
    if (error && /fetch|network|timeout/i.test(error.message)) return; // try again next time
  }
  claimedRounds.add(tag);
}

export async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const st = useStore.getState();
    // Round setup changes first: a swapped-in player's scores need the round's new player list online.
    const dirty = useStore.getState().dirtyRounds;
    const cleared: string[] = [];
    for (const id of dirty) {
      const r = useStore.getState().rounds.find((x) => x.id === id);
      if (!r?.remote) { cleared.push(id); continue; }
      const { error } = await supabase.from('rounds').update({ data: roundDoc(r), status: r.status, updated_at: new Date().toISOString() }).eq('id', id);
      if (!error) cleared.push(id);
    }
    if (cleared.length) useStore.getState().clearDirty(cleared);
    const done = [];
    for (const rid of new Set(st.outbox.map((i) => i.roundId))) await claimMe(rid).catch(() => undefined);
    for (const item of st.outbox) {
      const { error } = await supabase.rpc('upsert_score', {
        p_round: item.roundId,
        p_key: item.key,
        p_hole: item.hole,
        p_gross: item.gross,
        p_entered_at: item.enteredAt,
      });
      if (error) {
        // Network trouble: try again later. Permission errors (including "not your match"): drop it.
        if (/fetch|network|timeout/i.test(error.message)) break;
      }
      done.push(item);
    }
    if (done.length) useStore.getState().removeOutbox(done);

    // Deletions: once Undo is no longer offered, delete it online (or leave it, if someone else started it).
    const doneDeletes: string[] = [];
    for (const [id, t] of Object.entries(useStore.getState().deleted ?? {})) {
      if (t.done || Date.now() - t.at < UNDO_WINDOW_MS) continue;
      if (!t.online) { doneDeletes.push(id); continue; }
      const table = t.kind === 'round' ? 'rounds' : 'events';
      const { error } = t.owner
        ? await supabase.from(table).delete().eq('id', id)
        : await supabase.rpc(t.kind === 'round' ? 'leave_round' : 'leave_event', t.kind === 'round' ? { rid: id } : { eid: id });
      if (!error || !/fetch|network|timeout/i.test(error.message)) doneDeletes.push(id);
    }
    if (doneDeletes.length) useStore.getState().markDeletedDone(doneDeletes);


    const dirtyEvents = useStore.getState().dirtyEvents;
    const doneEvents: string[] = [];
    for (const id of dirtyEvents) {
      const e = useStore.getState().events.find((x) => x.id === id);
      if (!e?.remote) { doneEvents.push(id); continue; }
      const { error } = await supabase.from('events').update({ data: eventDoc(e), updated_at: new Date().toISOString() }).eq('id', id);
      if (!error) doneEvents.push(id);
    }
    if (doneEvents.length) useStore.getState().clearDirtyEvents(doneEvents);
  } finally {
    flushing = false;
  }
}

// ------------------------------------------------------------------ names

async function loadNames(ids: string[]) {
  const st = useStore.getState();
  const missing = [...new Set(ids)].filter((id) => !st.names[id] && id !== st.me);
  if (!missing.length) return;
  const { data } = await supabase.from('profiles').select('id, display_name').in('id', missing);
  for (const p of data ?? []) if (p.display_name) useStore.getState().setName(p.id, p.display_name);
}

// ------------------------------------------------------------------ live

const channels = new Map<string, RealtimeChannel>();

/** Keep one live subscription per shared round/event that's still in play. */
export function syncSubscriptions() {
  const st = useStore.getState();
  const wanted = new Set<string>();

  for (const r of st.rounds) {
    if (!r.remote) continue;
    const key = `round:${r.id}`;
    wanted.add(key);
    if (channels.has(key)) continue;
    const ch = supabase
      .channel(key)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `round_id=eq.${r.id}` }, (payload) => {
        const row = payload.new as ScoreRow;
        if (!row?.key) return;
        useStore.getState().applyRemoteScores(r.id, [toEntry(row)]);
        void loadNames([row.entered_by]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `id=eq.${r.id}` }, () => void pullRound(r.id))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void pullRound(r.id);
      });
    channels.set(key, ch);
  }

  for (const e of st.events) {
    if (!e.remote) continue;
    const key = `event:${e.id}`;
    wanted.add(key);
    if (channels.has(key)) continue;
    const ch = supabase
      .channel(key)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rounds', filter: `event_id=eq.${e.id}` }, (payload) => {
        const row = payload.new as { id: string };
        void pullRound(row.id);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${e.id}` }, () => void pullEvent(e.id))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void pullEvent(e.id);
      });
    channels.set(key, ch);
  }

  for (const [key, ch] of channels) {
    if (!wanted.has(key)) {
      void supabase.removeChannel(ch);
      channels.delete(key);
    }
  }
}

export function resetSubscriptions() {
  for (const ch of channels.values()) void supabase.removeChannel(ch);
  channels.clear();
}

// ------------------------------------------------------------------ event score for someone following one round

/**
 * Someone following a single round (round code only) can't see the event itself. This fetches a read-only
 * copy of the event and its rounds so the overall score can be shown. Nothing is saved on the phone.
 */
export async function fetchRoundEvent(roundId: string): Promise<{ event: EventRecord; rounds: RoundRecord[] } | null> {
  const { data, error } = await supabase.rpc('round_event_snapshot', { rid: roundId });
  if (error || !data?.event) return null;
  const doc = data.event.data as EventDoc;
  const { playerInfo: _p, ...e } = doc;
  const event: EventRecord = { ...e, id: data.event.id, remote: { shareCode: data.event.share_code, role: 'viewer' } };
  const rounds: RoundRecord[] = (data.rounds as (RoundRow & { scores: ScoreRow[] })[]).map((row) => {
    const r = roundFromRow(row, 'viewer');
    for (const s of row.scores ?? []) {
      if (s.gross == null) continue;
      const en = toEntry(s);
      r.ledger[`${en.key}#${en.hole}`] = { ...en, gross: s.gross };
    }
    return r;
  });
  return { event, rounds };
}

// ------------------------------------------------------------------ add an existing round to an event

/** After a round is put into an event: make sure everyone in a shared event sees it. */
export async function syncRoundIntoEvent(roundId: string) {
  const st = useStore.getState();
  const r = st.rounds.find((x) => x.id === roundId);
  const ev = r?.eventId ? st.events.find((e) => e.id === r.eventId) : undefined;
  if (!r || !ev?.remote || ev.remote.role === 'viewer') return;
  if (!r.remote) {
    await autoShare(roundId); // shares it into the event
    return;
  }
  // Already online: point it at the event so the event's members get it.
  await supabase.from('rounds').update({ event_id: ev.id, data: roundDoc(r) }).eq('id', r.id);
}
