/**
 * Offline-first sync with Supabase.
 *
 * The phone's own store is always the source of truth for the screen. When a
 * round is shared, every score goes into an outbox and is sent when there's
 * signal; scores from other scorekeepers arrive live and are merged with
 * "latest entry wins" (the group gets a notice when someone's score changes).
 */
import type { RealtimeChannel } from '@supabase/supabase-js';

import { useStore, type EventRecord, type Remote, type RoundRecord } from '@/store/store';
import { ensureSession } from './auth';
import { supabase } from './supabase';

// ------------------------------------------------------------------ documents

type RoundDoc = Pick<RoundRecord, 'createdAt' | 'courseId' | 'players' | 'games' | 'statsEnabled' | 'eventId' | 'label'>;

function roundDoc(r: RoundRecord): RoundDoc {
  return { createdAt: r.createdAt, courseId: r.courseId, players: r.players, games: r.games, statsEnabled: r.statsEnabled, eventId: r.eventId, label: r.label };
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

async function pullRound(roundId: string, role?: Remote['role']) {
  const [{ data: row }, { data: scores }] = await Promise.all([
    supabase.from('rounds').select('id, share_code, event_id, status, data').eq('id', roundId).maybeSingle(),
    supabase.from('scores').select('*').eq('round_id', roundId),
  ]);
  if (!row) return;
  const st = useStore.getState();
  const local = st.rounds.find((r) => r.id === roundId);
  const resolvedRole = role ?? local?.remote?.role ?? (await myRole('round_members', 'round_id', roundId));
  st.upsertRemoteRound(roundFromRow(row as RoundRow, resolvedRole));
  if (scores?.length) st.applyRemoteScores(roundId, (scores as ScoreRow[]).map(toEntry));
  await loadNames((scores as ScoreRow[] | null)?.map((s) => s.entered_by) ?? []);
}

async function pullEvent(eventId: string, role?: Remote['role']) {
  const { data: row } = await supabase.from('events').select('id, share_code, data').eq('id', eventId).maybeSingle();
  if (!row) return;
  const doc = row.data as EventDoc;
  const st = useStore.getState();
  for (const p of doc.playerInfo ?? []) if (!st.players.some((x) => x.id === p.id)) st.upsertPlayer(p);
  const { playerInfo: _p, ...e } = doc;
  const resolvedRole = role ?? st.events.find((x) => x.id === eventId)?.remote?.role ?? (await myRole('event_members', 'event_id', eventId));
  st.upsertRemoteEvent({ ...e, remote: { shareCode: row.share_code, role: resolvedRole } });
  const { data: rounds } = await supabase.from('rounds').select('id').eq('event_id', eventId);
  for (const r of rounds ?? []) await pullRound(r.id, resolvedRole === 'owner' ? 'scorer' : resolvedRole);
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

// ------------------------------------------------------------------ upload

let flushing = false;

/** Send queued scores and game changes. Safe to call any time; does nothing offline. */
export async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const st = useStore.getState();
    const done = [];
    for (const item of st.outbox) {
      const { error } = await supabase.rpc('upsert_score', {
        p_round: item.roundId,
        p_key: item.key,
        p_hole: item.hole,
        p_gross: item.gross,
        p_entered_at: item.enteredAt,
      });
      if (error) {
        // Network trouble: try again later. Permission errors: drop it.
        if (/fetch|network|timeout/i.test(error.message)) break;
      }
      done.push(item);
    }
    if (done.length) useStore.getState().removeOutbox(done);

    const dirty = useStore.getState().dirtyRounds;
    const cleared: string[] = [];
    for (const id of dirty) {
      const r = useStore.getState().rounds.find((x) => x.id === id);
      if (!r?.remote) { cleared.push(id); continue; }
      const { error } = await supabase.from('rounds').update({ data: roundDoc(r), status: r.status, updated_at: new Date().toISOString() }).eq('id', id);
      if (!error) cleared.push(id);
    }
    if (cleared.length) useStore.getState().clearDirty(cleared);

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
