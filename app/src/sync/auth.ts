import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { useStore, type SavedPlayer } from '@/store/store';
import { supabase } from './supabase';

/** Make sure we have a session; guests get an anonymous one (no email needed). */
export async function ensureSession(): Promise<Session> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error || !anon.session) throw new Error(error?.message ?? 'Could not start a guest session');
  return anon.session;
}

export async function signUp(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
  if (error) throw new Error(error.message);
  if (data.session) await saveProfileName(name);
  return { needsConfirmation: !data.session, userId: data.user?.id ?? null };
}

/** Save my player (name, index, tees) to my account so it follows me to other phones. */
export async function saveMyProfile(p: SavedPlayer) {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user || user.is_anonymous) return;
  await supabase.from('profiles').upsert({ id: user.id, display_name: p.name, handicap_index: p.handicapIndex, gender: p.gender });
  useStore.getState().setName(user.id, p.name);
}

/** After signing in on a phone that doesn't know me yet, rebuild my player from my account. */
export async function restoreMe() {
  const st = useStore.getState();
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user || user.is_anonymous) return;
  const local = st.players.find((p) => p.id === st.myPlayerId);
  if (local) {
    // Already know who I am on this phone: make sure my account has the latest.
    await saveMyProfile(local);
    return;
  }
  const { data: profile } = await supabase.from('profiles').select('display_name, handicap_index, gender').eq('id', user.id).maybeSingle();
  const name = profile?.display_name ?? (user.user_metadata?.name as string | undefined);
  if (!name) return;
  st.upsertPlayer({ id: user.id, name, handicapIndex: Number(profile?.handicap_index ?? 0), gender: (profile?.gender as 'M' | 'F') ?? 'M' });
  st.setMyPlayer(user.id);
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function saveProfileName(name: string) {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id || !name.trim()) return;
  await supabase.from('profiles').upsert({ id, display_name: name.trim() });
  useStore.getState().setName(id, name.trim());
}

export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}
