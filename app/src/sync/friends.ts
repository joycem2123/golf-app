/**
 * Friends on Clutch Up. Adding someone sends a friend request; the friendship
 * exists (for both people) once they accept.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
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

/** Unfriend (removes the friendship for both people). */
export async function removeFriend(p: SavedPlayer) {
  useStore.getState().removePlayer(p.id);
  if (p.userId) await supabase.rpc('remove_friend', { target: p.userId });
  await refreshRequests();
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
      if (!p.pending) useStore.getState().upsertPlayer({ ...p, pending: true });
      continue;
    }
    useStore.getState().removePlayer(p.id);
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
