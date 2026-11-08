import type { GameConfig } from '@golf/engine';
import { createContext, useContext, useEffect, useState } from 'react';

import { gameKeys } from '@/lib/games';
import { useStore, type RoundRecord } from '@/store/store';
import { supabase } from '@/sync/supabase';
import { claimMe } from '@/sync/sync';

/**
 * Who can enter a match's scores (the server enforces the same rules):
 * someone playing in it; anyone, when every player in it is a guest (no Clutch Up account);
 * or someone a player in it said yes to.
 */

/** Player ids in a game (both sides). */
export function playersIn(g: GameConfig): string[] {
  switch (g.type) {
    case 'matchPlay':
    case 'nassau': return [...g.sideA.members, ...g.sideB.members];
    case 'vegas': return [...g.teamA.members, ...g.teamB.members];
    case 'scramble':
    case 'shamble': return g.teams.flatMap((t) => t.members);
    case 'wolf': return g.order;
    case 'stableford': return g.teams ? g.teams.flatMap((t) => t.members) : (g.playerIds ?? []);
    default: return (g as { playerIds?: string[] }).playerIds ?? [];
  }
}

/** Players with a Clutch Up account have their account id as their player id; guests don't. */
const isAccount = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** The id the server uses for a game (its id, or its position). */
export const gameId = (r: RoundRecord, gi: number) => r.games[gi]?.id ?? String(gi);

export type EditRequest = { id: string; round_id: string; game_id: string; requester: string; requester_name: string | null; status: 'pending' | 'approved' | 'declined' };

/** What the rules need to know: my account, which players are me, and the round's requests and "that's me" claims. */
export type Rights = { uid: string | null; isMe: (id: string) => boolean; requests: EditRequest[]; claimed: string[] };

/** May I edit game `gi`? (Not signed in: everything stays on this phone, so yes.) */
export function canEditGame(r: RoundRecord, gi: number, { uid, isMe, requests, claimed }: Rights): boolean {
  if (!uid) return true;
  const g = r.games[gi];
  if (!g) return true;
  const members = playersIn(g);
  if (members.some((m) => m === uid || isMe(m))) return true;
  if (!members.some((m) => isAccount(m) || claimed.includes(m))) return true;
  return requests.some((q) => q.game_id === gameId(r, gi) && q.requester === uid && q.status === 'approved');
}

/** May `uid` enter this score key? Yes if any game it's part of allows it. */
export function canEditKey(r: RoundRecord, key: string, rights: Rights): boolean {
  if (!rights.uid) return true;
  const games = r.games.map((_, i) => i).filter((i) => gameKeys(r.games[i]).includes(key));
  if (games.length === 0) return true;
  return games.some((i) => canEditGame(r, i, rights));
}

/** Am I playing in game `gi`? (Only players can answer requests.) */
export const playsIn = (r: RoundRecord, gi: number, { uid, isMe }: Pick<Rights, 'uid' | 'isMe'>) =>
  !!uid && !!r.games[gi] && playersIn(r.games[gi]).some((m) => m === uid || isMe(m));

/** This round's edit requests, kept up to date while the screen is open. */
export function useEditRequests(r: RoundRecord | undefined) {
  const [list, setList] = useState<EditRequest[]>([]);
  const [claimed, setClaimed] = useState<string[]>([]);
  const [tick, setTick] = useState(0);
  const online = !!r?.remote;
  const id = r?.id;
  useEffect(() => {
    if (!id || !online) return;
    let live = true;
    const load = async () => {
      await claimMe(id).catch(() => undefined);
      const [{ data }, { data: ids }] = await Promise.all([
        supabase.from('edit_requests').select('id, round_id, game_id, requester, requester_name, status').eq('round_id', id),
        supabase.from('round_identities').select('player_id').eq('round_id', id),
      ]);
      if (live && data) setList(data as EditRequest[]);
      if (live && ids) setClaimed(ids.map((x: { player_id: string }) => x.player_id));
    };
    void load();
    const ch = supabase
      .channel(`edit-requests:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'edit_requests', filter: `round_id=eq.${id}` }, () => void load())
      .subscribe();
    // Realtime can miss a change; check now and then too.
    const t = setInterval(() => void load(), 20000);
    return () => { live = false; clearInterval(t); void supabase.removeChannel(ch); };
  }, [id, online, tick]);
  return { requests: list, claimed, reload: () => setTick((n) => n + 1) };
}

/** Score boxes read this to know whether they can be changed. */
export const EditRights = createContext<(key: string) => boolean>(() => true);
export const useCanEdit = (key: string) => useContext(EditRights)(key);

/** The signed-in account id. */
export const useAccountId = () => useStore((s) => s.me);
