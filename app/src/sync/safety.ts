/** Deleting my account, and blocking or reporting other users. */
import { forgetAccount, GUEST_KEY, accountKey, switchAccount } from '@/store/accounts';
import { useStore, type SavedPlayer } from '@/store/store';
import { supabase } from './supabase';

/** Permanently delete my account and its data, then go back to a clean guest state on this phone. */
export async function deleteMyAccount() {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) throw new Error('Sign in first.');
  const { error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) throw new Error('Couldn’t delete your account. Check your connection and try again.');
  await supabase.auth.signOut().catch(() => undefined);
  await switchAccount(GUEST_KEY);
  await forgetAccount(accountKey(user.id));
  useStore.getState().setOnboarded(false);
}

/** Block someone: they're removed from my friends and can't find me, add me or share with me. */
export async function blockUser(p: SavedPlayer) {
  if (!p.userId) return;
  const { error } = await supabase.rpc('block_user', { target: p.userId });
  if (error) throw new Error('Couldn’t block. Check your connection and try again.');
  useStore.getState().removePlayer(p.id);
}

export async function reportUser(p: SavedPlayer, reason: string, details?: string) {
  if (!p.userId) return;
  const { error } = await supabase.rpc('report_user', { target: p.userId, reason, details: details ?? null });
  if (error) throw new Error('Couldn’t send the report. Check your connection and try again.');
}
