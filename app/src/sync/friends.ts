/** Friends on MatchDay: search by username or name, linked to their accounts. */
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

const toPlayer = (p: ProfileHit): SavedPlayer => ({
  id: p.id,
  userId: p.id,
  username: p.username,
  name: p.display_name || p.username,
  handicapIndex: Number(p.handicap_index ?? 0),
  gender: p.gender ?? 'M',
});

export async function searchProfiles(q: string): Promise<ProfileHit[]> {
  const term = q.trim().replace(/^@/, '');
  if (!term) return [];
  await ensureSession();
  const { data, error } = await supabase.rpc('search_profiles', { q: term });
  if (error) throw new Error('Search is unavailable right now. Check your connection.');
  return (data ?? []) as ProfileHit[];
}

export async function addFriend(hit: ProfileHit) {
  const st = useStore.getState();
  st.upsertPlayer(toPlayer(hit));
  await supabase.from('friends').upsert({ friend_id: hit.id }, { onConflict: 'owner,friend_id' });
}

export async function removeFriend(p: SavedPlayer) {
  useStore.getState().removePlayer(p.id);
  if (p.userId) await supabase.from('friends').delete().eq('friend_id', p.userId);
}

/** Send this phone's linked friends to my account. */
export async function pushFriends() {
  const linked = useStore.getState().players.filter((p) => p.userId && p.id !== useStore.getState().myPlayerId);
  if (linked.length) await supabase.from('friends').upsert(linked.map((p) => ({ friend_id: p.userId })), { onConflict: 'owner,friend_id' });
}

/** Bring down my friends list and refresh everyone's name and handicap index. */
export async function pullFriends() {
  const { data: rows } = await supabase.from('friends').select('friend_id');
  const ids = [...new Set([...(rows ?? []).map((r) => r.friend_id as string), ...useStore.getState().players.filter((p) => p.userId).map((p) => p.userId!)])];
  const mine = useStore.getState().myPlayerId;
  const want = ids.filter((id) => id !== mine);
  if (!want.length) return;
  const { data: profiles } = await supabase.from('profiles').select('id, username, display_name, handicap_index, gender').in('id', want);
  for (const p of (profiles ?? []) as ProfileHit[]) {
    if (!p.username) continue;
    useStore.getState().upsertPlayer(toPlayer(p));
  }
}
