import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { splitName } from '@/components/player-form';
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

export const USERNAME_RULE = /^[a-z0-9_.]{3,20}$/;

/** Lowercase, keep only allowed characters. */
export const cleanUsername = (u: string) => u.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20);

export async function usernameAvailable(u: string): Promise<boolean> {
  if (!USERNAME_RULE.test(u)) return false;
  const { data, error } = await supabase.rpc('username_available', { u });
  if (error) throw new Error('Could not check the username. Check your connection.');
  return !!data;
}

/** Make my player's id match my account id (old id is kept as an alias so past rounds still count). */
export async function claimIdentity() {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  const st = useStore.getState();
  if (uid && st.myPlayerId && st.myPlayerId !== uid) st.replaceMyPlayerId(uid);
}

/** Save my player and username to my account (works for guests too). */
export async function saveMyProfile(p: SavedPlayer, username = useStore.getState().myUsername) {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return;
  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      display_name: p.name,
      first_name: splitName(p).first || null,
      last_name: splitName(p).last || null,
      handicap_index: p.handicapIndex,
      gender: p.gender,
      ...(username ? { username } : {}),
    });
  if (error) {
    if (error.code === '23505') throw new Error(`@${username} is already taken. Try another.`);
    throw new Error(error.message);
  }
  useStore.getState().setName(user.id, p.name);
  if (username) useStore.getState().setMyUsername(username);
}

/** Free my username (used when a guest moves to a full account). */
export async function releaseUsername() {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (user?.is_anonymous) await supabase.from('profiles').update({ username: null }).eq('id', user.id);
}

/** After signing in, rebuild my player and friends from my account, or push what this phone knows. */
export async function restoreMe() {
  const st = useStore.getState();
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return;
  await claimIdentity();
  const local = useStore.getState().players.find((p) => p.id === useStore.getState().myPlayerId);
  const { data: profile } = await supabase.from('profiles').select('display_name, first_name, last_name, handicap_index, gender, username').eq('id', user.id).maybeSingle();
  if (profile?.username) st.setMyUsername(profile.username);
  if (local) {
    await saveMyProfile(local).catch(() => undefined);
  } else {
    const name = profile?.display_name ?? (user.user_metadata?.name as string | undefined);
    if (name) {
      st.upsertPlayer({ id: user.id, userId: user.id, username: profile?.username ?? undefined, name, firstName: profile?.first_name ?? undefined, lastName: profile?.last_name ?? undefined, handicapIndex: Number(profile?.handicap_index ?? 0), gender: (profile?.gender as 'M' | 'F') ?? 'M' });
      st.setMyPlayer(user.id);
    }
  }
  const { pullFriends } = await import('./friends');
  await pullFriends();
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

const friendlyAuthError = (m: string) =>
  /invalid login|invalid credentials/i.test(m)
    ? 'Your current password isn’t right.'
    : /same.*password|different from the old/i.test(m)
      ? 'Choose a password different from your current one.'
      : /already (been )?registered|already in use|email.*exists/i.test(m)
        ? 'That email is already used by another account.'
        : /weak|at least|short/i.test(m)
          ? 'That password is too weak. Use at least 8 characters.'
          : /fetch|network/i.test(m)
            ? 'No connection. Try again when you have signal.'
            : m;

/** Check the current password before a sensitive change. */
async function confirmPassword(current: string) {
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user.email;
  if (!email) throw new Error('Sign in first.');
  const { error } = await supabase.auth.signInWithPassword({ email, password: current });
  if (error) throw new Error(friendlyAuthError(error.message));
}

/** Change my email. Supabase emails a confirmation link; the change applies once it's clicked. */
export async function changeEmail(newEmail: string, currentPassword: string) {
  await confirmPassword(currentPassword);
  const { error } = await supabase.auth.updateUser({ email: newEmail.trim().toLowerCase() });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function changePassword(currentPassword: string, newPassword: string) {
  await confirmPassword(currentPassword);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(friendlyAuthError(error.message));
}
