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

/** Where confirmation links land: a page that says it worked and opens the app. */
export const AUTH_LANDING = 'https://clutchupgolf.com/confirmed.html';

export async function signUp(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: AUTH_LANDING } });
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
  const { data: saved, error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      display_name: p.name,
      first_name: splitName(p).first || null,
      last_name: splitName(p).last || null,
      handicap_index: p.handicapIndex,
      gender: p.gender,
      ...(username ? { username } : {}),
    })
    .select('handicap_updated_at')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') throw new Error(`@${username} is already taken. Try another.`);
    throw new Error(error.message);
  }
  useStore.getState().setName(user.id, p.name);
  if (username) useStore.getState().setMyUsername(username);
  // A changed index answers any friend who asked me to update it.
  if (saved?.handicap_updated_at) {
    const before = useStore.getState().myHandicapUpdatedAt;
    useStore.getState().setMyHandicapUpdatedAt(saved.handicap_updated_at);
    if (before && before !== saved.handicap_updated_at) void import('./nudges').then((m) => m.answerNudges());
  }
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
  const { data: profile } = await supabase.from('profiles').select('display_name, first_name, last_name, handicap_index, gender, username, handicap_updated_at').eq('id', user.id).maybeSingle();
  if (profile?.handicap_updated_at) st.setMyHandicapUpdatedAt(profile.handicap_updated_at);
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

/** Sign in with an email or a username. A username is swapped for its email only if the password is right. */
export async function signIn(emailOrUsername: string, password: string) {
  let email = emailOrUsername.trim();
  if (!email.includes('@') || email.startsWith('@')) {
    const { data, error } = await supabase.rpc('login_email', { u: email, pw: password });
    if (error) {
      throw new Error(
        /too_many_attempts/.test(error.message)
          ? 'Too many wrong tries for that username. Wait 15 minutes, or sign in with your email.'
          : /fetch|network/i.test(error.message)
            ? 'No connection. Try again when you have signal.'
            : 'Could not sign in. Try again.',
      );
    }
    if (!data) throw new Error('That username and password don’t match.');
    email = data as string;
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      /invalid login|invalid credentials/i.test(error.message)
        ? 'That email and password don’t match.'
        : /not confirmed/i.test(error.message)
          ? 'Confirm your email first: tap the link we sent you.'
          : /fetch|network/i.test(error.message)
            ? 'No connection. Try again when you have signal.'
            : error.message,
    );
  }
}

/** Email a reset link. The link opens a page on clutchupgolf.com where the new password is set. */
export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: AUTH_LANDING });
  if (error && /fetch|network/i.test(error.message)) throw new Error('No connection. Try again when you have signal.');
  if (error && /rate|too many|seconds/i.test(error.message)) throw new Error('Too many tries. Wait a minute, then try again.');
  // Any other error is ignored on purpose: we never reveal whether an email has an account.
}

/** "Forgot your email?": a masked hint (like jo•••@gm•••.com) for a username, or null. */
export async function emailHint(username: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('email_hint', { u: username.trim().replace(/^@/, '').toLowerCase() });
  if (error) throw new Error('Could not look that up. Check your connection.');
  return (data as string | null) ?? null;
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
        : /weak|at least|short|should contain|characters/i.test(m)
          ? 'That password is too weak. Use at least 8 characters with an uppercase letter, a lowercase letter, a number and a special character.'
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
  const { error } = await supabase.auth.updateUser({ email: newEmail.trim().toLowerCase() }, { emailRedirectTo: AUTH_LANDING });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function changePassword(currentPassword: string, newPassword: string) {
  await confirmPassword(currentPassword);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(friendlyAuthError(error.message));
}
