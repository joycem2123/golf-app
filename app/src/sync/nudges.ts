/**
 * Handicap reminders: friends asking each other to update their index before a match,
 * "still right" confirmations, and push notifications for those requests.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { useStore } from '@/store/store';
import { supabase } from './supabase';
import { track } from '@/lib/usage';

/** A handicap index older than this gets a reminder. */
export const STALE_DAYS = 14;

export const isStale = (at: string | null | undefined) => !at || Date.now() - Date.parse(at) > STALE_DAYS * 86400000;

/** "today", "3 days ago", "2 weeks ago", "3 months ago". */
export function ago(at: string | null | undefined): string {
  if (!at) return 'a while ago';
  const days = Math.floor((Date.now() - Date.parse(at)) / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

// Show requests as banners even while Clutch Up is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Ask for notification permission and save this phone's push token (signed-in accounts only). */
export async function registerPush() {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user || user.is_anonymous || Platform.OS === 'web') return;
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (token) await supabase.from('push_tokens').upsert({ user_id: user.id, token, updated_at: new Date().toISOString() });
  } catch {
    // Notifications aren't available here (e.g. some test apps); the in-app banner still works.
  }
}

/** Ask the server to send a push notification for something that just happened (it checks it, and sends it once). */
export function notify(body: { kind: 'edit'; id: string } | { kind: 'friend'; to: string } | { kind: 'round'; id: string }) {
  void supabase.functions.invoke('notify', { body }).catch(() => undefined);
}

/** Before the organiser deletes a round or event: tell everyone else in it (waits, as the members go with it). */
export async function notifyDeleted(kind: 'round' | 'event', id: string) {
  await supabase.functions.invoke('notify', { body: { kind: 'deleted', id, to: kind } }).catch(() => undefined);
}

/** Tapping a notification: open the round it's about, or the friend requests. */
export function watchNotificationTaps(open: (path: string) => void) {
  if (Platform.OS === 'web') return () => undefined;
  const go = async (data: Record<string, unknown> | undefined) => {
    if (!data) return;
    if (data.kind === 'friend_request') return open('/friends');
    if ((data.kind === 'edit_request' || data.kind === 'round_added') && typeof data.roundId === 'string') {
      const { pullMine } = await import('./sync');
      await pullMine().catch(() => undefined);
      open(`/round/${data.roundId}`);
    }
    // A friend's match I get alerts for: open it if it's on my phone (followed), otherwise Friends' Matches.
    if ((data.kind === 'match_update' || data.kind === 'round_started') && typeof data.roundId === 'string') {
      const { pullMine } = await import('./sync');
      await pullMine().catch(() => undefined);
      const { useStore } = await import('@/store/store');
      const onPhone = useStore.getState().rounds.some((r) => r.id === data.roundId);
      open(onPhone ? `/round/${data.roundId}${typeof data.gi === 'string' ? `?match=${data.gi}` : ''}` : '/scores');
    }
  };
  void Notifications.getLastNotificationResponseAsync().then((r) => r && go(r.notification.request.content.data));
  const sub = Notifications.addNotificationResponseReceivedListener((r) => void go(r.notification.request.content.data));
  return () => sub.remove();
}

/** Requests from friends I haven't answered yet. */
export async function pullNudges() {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) return;
  const { data: rows, error } = await supabase.from('nudges').select('id, from_user, created_at').eq('to_user', me).is('seen_at', null).order('created_at', { ascending: false });
  if (error) return;
  const from = [...new Set((rows ?? []).map((r) => r.from_user as string))];
  const names: Record<string, string> = {};
  if (from.length) {
    const { data: ps } = await supabase.from('profiles').select('id, display_name').in('id', from);
    for (const p of ps ?? []) if (p.display_name) names[p.id] = p.display_name;
  }
  // One per friend (the latest).
  const seen = new Set<string>();
  useStore.getState().setNudges(
    (rows ?? [])
      .filter((r) => !seen.has(r.from_user) && seen.add(r.from_user))
      .map((r) => ({ id: r.id, from: r.from_user, fromName: names[r.from_user], at: r.created_at })),
  );
}

let channel: RealtimeChannel | null = null;
export function watchNudges(uid: string | null) {
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
  if (!uid) return;
  channel = supabase
    .channel(`nudges:${uid}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nudges', filter: `to_user=eq.${uid}` }, () => void pullNudges())
    .subscribe((s) => s === 'SUBSCRIBED' && void pullNudges());
}

/** Ask these friends (account ids) to update their handicap index. */
export async function askToUpdate(userIds: string[]): Promise<{ sent: string[]; skipped: string[] }> {
  const { data, error } = await supabase.functions.invoke('nudge', { body: { to: userIds } });
  if (error) throw new Error('Couldn’t send. Check your connection and try again.');
  track('handicap_nudge_sent', { friends: userIds.length });
  return data as { sent: string[]; skipped: string[] };
}

/** Mark friends' requests as answered (I updated or confirmed my index). */
export async function answerNudges() {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  useStore.getState().setNudges([]);
  if (me) await supabase.from('nudges').update({ seen_at: new Date().toISOString() }).eq('to_user', me).is('seen_at', null);
}

/** "My index is still right." */
export async function confirmHandicap() {
  const { data, error } = await supabase.rpc('confirm_handicap');
  if (error) throw new Error('Couldn’t save. Check your connection and try again.');
  useStore.getState().setMyHandicapUpdatedAt((data as string) ?? new Date().toISOString());
  await answerNudges();
}
