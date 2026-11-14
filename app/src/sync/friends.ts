/**
 * Friends on Clutch Up. Adding someone sends a friend request; the friendship
 * exists (for both people) once they accept.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';

import { notify } from './nudges';
import { create } from 'zustand';

import { useStore, type SavedPlayer } from '@/store/store';
import { ensureSession } from './auth';
import { supabase } from './supabase';

export interface ProfileHit {
  id: string;
  username: string;
  display_name: string | null;
  handicap_index: number | null;
  gender: 'M' | 'F' | null;
}

export interface FriendRequest {
  id: string;
  direction: 'incoming' | 'outgoing';
  other_id: string;
  username: string | null;
  display_name: string | null;
  handicap_index: number | null;
  gender: 'M' | 'F' | null;
  created_at: string;
}

/** Pending requests to and from me (not saved on the phone; always fresh from the server). */
export const useFriendRequests = create<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>(() => ({ incoming: [], outgoing: [] }));

const toPlayer = (p: { id: string; username: string | null; display_name: string | null; handicap_index: number | null; gender: 'M' | 'F' | null; handicap_updated_at?: string | null }, pending = false): SavedPlayer => ({
  handicapUpdatedAt: p.handicap_updated_at ?? undefined,
  id: p.id,
  userId: p.id,
  username: p.username ?? undefined,
  name: p.display_name || p.username || 'Player',
  handicapIndex: Number(p.handicap_index ?? 0),
  gender: p.gender ?? 'M',
  pending,
});

export async function searchProfiles(q: string): Promise<ProfileHit[]> {
  const term = q.trim().replace(/^@/, '');
  if (!term) return [];
  await ensureSession();
  const { data, error } = await supabase.rpc('search_profiles', { q: term });
  if (error) throw new Error('Search is unavailable right now. Check your connection.');
  return (data ?? []) as ProfileHit[];
}

export async function refreshRequests() {
  const { data, error } = await supabase.rpc('list_friend_requests');
  if (error) return;
  const all = (data ?? []) as FriendRequest[];
  useFriendRequests.setState({ incoming: all.filter((r) => r.direction === 'incoming'), outgoing: all.filter((r) => r.direction === 'outgoing') });
}

/** Send a friend request (or accept theirs if they already asked). Returns what happened. */
export async function sendFriendRequest(hit: ProfileHit): Promise<'sent' | 'accepted' | 'friends'> {
  await ensureSession();
  const { data, error } = await supabase.rpc('send_friend_request', { target: hit.id });
  if (error) throw new Error(error.message);
  const result = data as 'sent' | 'accepted' | 'friends';
  if (result === 'sent') notify({ kind: 'friend', to: hit.id });
  useStore.getState().upsertPlayer(toPlayer(hit, result === 'sent'));
  await refreshRequests();
  return result;
}

export async function respondToRequest(r: FriendRequest, accept: boolean) {
  const { error } = await supabase.rpc('respond_friend_request', { req: r.id, accept });
  if (error) throw new Error(error.message);
  if (accept) useStore.getState().upsertPlayer(toPlayer({ id: r.other_id, username: r.username, display_name: r.display_name, handicap_index: r.handicap_index, gender: r.gender }));
  await refreshRequests();
}

export async function cancelRequest(p: SavedPlayer) {
  if (p.userId) await supabase.rpc('cancel_friend_request', { target: p.userId });
  useStore.getState().removePlayer(p.id);
  await refreshRequests();
}

/** Is this player in any of my rounds or events (so their name is still needed)? */
function inUse(id: string): boolean {
  const st = useStore.getState();
  return st.rounds.some((r) => r.players.some((p) => p.id === id)) || st.events.some((e) => e.playerIds.includes(id));
}

/** Take someone out of my friends list for good: kept (hidden) only if a round or event still needs their name. */
export function forgetPlayer(id: string) {
  if (inUse(id)) useStore.getState().setFriend([id], false);
  else useStore.getState().removePlayer(id);
}

/** Unfriend (removes the friendship for both people), or take a guest off my list. */
export async function removeFriend(p: SavedPlayer) {
  forgetPlayer(p.id);
  if (p.userId) await supabase.rpc('remove_friend', { target: p.userId });
  await refreshRequests();
}

/** Remove several at once (Edit on the friends list). */
export async function removeFriends(list: SavedPlayer[]) {
  for (const p of list) forgetPlayer(p.id);
  await Promise.all(list.filter((p) => p.userId).map((p) => supabase.rpc('remove_friend', { target: p.userId })));
  await refreshRequests();
}

/** Add someone I played with: a guest goes straight into my list; someone on Clutch Up gets a friend request. */
export async function befriend(p: SavedPlayer): Promise<'added' | 'sent' | 'accepted' | 'friends'> {
  if (!p.userId) {
    useStore.getState().setFriend([p.id], true);
    return 'added';
  }
  return sendFriendRequest({ id: p.userId, username: p.username ?? '', display_name: p.name, handicap_index: p.handicapIndex, gender: p.gender });
}

/** Bring my friends list in line with my account: accepted friends, waiting requests, and anyone who's gone. */
export async function pullFriends() {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return;
  const [{ data: rows, error: e1 }] = await Promise.all([supabase.from('friends').select('friend_id'), refreshRequests()]);
  if (e1) return;
  const accepted = new Set((rows ?? []).map((r) => r.friend_id as string));
  const outgoing = new Set(useFriendRequests.getState().outgoing.map((r) => r.other_id));
  const st = useStore.getState();

  // Linked players who are neither friends nor waiting on a request (they declined, or unfriended me).
  for (const p of st.players) {
    if (!p.userId || p.id === st.myPlayerId || st.meAliases.includes(p.id)) continue;
    if (accepted.has(p.userId)) continue;
    if (outgoing.has(p.userId)) {
      if (!p.pending) useStore.getState().upsertPlayer({ ...p, pending: true, notFriend: undefined });
      continue;
    }
    // Not a friend (any more): hide them from my list, keeping their name where a round or event needs it.
    if (!p.notFriend || p.pending) forgetPlayer(p.id);
  }

  const want = [...accepted, ...outgoing];
  if (!want.length) return;
  const { data: profiles } = await supabase.from('profiles').select('id, username, display_name, handicap_index, gender, handicap_updated_at').in('id', want);
  for (const p of (profiles ?? []) as ProfileHit[]) useStore.getState().upsertPlayer(toPlayer(p, !accepted.has(p.id)));
}

let channel: RealtimeChannel | null = null;

/** Live updates when someone sends, accepts or removes a friend request. */
export function watchFriends(uid: string | null) {
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
  if (!uid) return;
  const refresh = () => void pullFriends();
  channel = supabase
    .channel(`friends:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `to_user=eq.${uid}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `from_user=eq.${uid}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friends', filter: `owner=eq.${uid}` }, refresh)
    .subscribe();
}
