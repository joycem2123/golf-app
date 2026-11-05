import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { useStore } from '@/store/store';
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
  return { needsConfirmation: !data.session };
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
