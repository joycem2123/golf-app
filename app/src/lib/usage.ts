/**
 * Anonymous feature-usage tracking: which features get used, so we know what people value.
 * Records only an event name (like "round_created"), a few non-personal details (like the game type),
 * the screen, platform and app version, tied to a random id for this install (not to the account).
 * Never names, emails, usernames, scores or locations. People can turn it off in More.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/sync/supabase';

type Props = Record<string, string | number | boolean | null | undefined>;
interface UsageEvent {
  install_id: string;
  name: string;
  props: Props | null;
  screen: string | null;
  platform: string;
  app_version: string | null;
  at: string;
}

const ID_KEY = 'usage:install-id';
const OFF_KEY = 'usage:off';
const QUEUE_KEY = 'usage:queue';
const MAX_QUEUE = 300;

let installId: string | null = null;
let off = false;
let queue: UsageEvent[] = [];
let loaded: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let currentScreen: string | null = null;
const listeners = new Set<(on: boolean) => void>();

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

function load() {
  loaded ??= (async () => {
    try {
      const [id, o, q] = await Promise.all([AsyncStorage.getItem(ID_KEY), AsyncStorage.getItem(OFF_KEY), AsyncStorage.getItem(QUEUE_KEY)]);
      off = o === '1';
      installId = id ?? uuid();
      if (!id) await AsyncStorage.setItem(ID_KEY, installId);
      const saved = q ? (JSON.parse(q) as UsageEvent[]) : [];
      queue = [...saved, ...queue.map((e) => ({ ...e, install_id: installId! }))].slice(-MAX_QUEUE);
    } catch {
      installId ??= uuid();
    }
  })();
  return loaded;
}

const persist = () => AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue)).catch(() => undefined);

/** Keep only short, non-personal values. */
function clean(props?: Props): Props | null {
  if (!props) return null;
  const out: Props = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    out[k.slice(0, 30)] = typeof v === 'string' ? v.slice(0, 40) : v;
  }
  return Object.keys(out).length ? out : null;
}

/** Record that a feature was used. Safe to call anywhere; never throws, never blocks. */
export function track(name: string, props?: Props) {
  if (off || !/^[a-z0-9_]{1,40}$/.test(name)) return;
  queue.push({
    install_id: installId ?? '',
    name,
    props: clean(props),
    screen: currentScreen,
    platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
    app_version: Constants.expoConfig?.version ?? null,
    at: new Date().toISOString(),
  });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  void load().then(persist);
  timer ??= setTimeout(() => void flush(), 20_000);
}

/** Send what's queued. Kept on the phone and retried later if offline. */
export async function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  await load();
  if (off || !queue.length || !installId) return;
  const batch = queue.slice(0, 100).map((e) => ({ ...e, install_id: e.install_id || installId! }));
  const { error } = await supabase.from('usage_events').insert(batch);
  if (error) return;
  queue = queue.slice(batch.length);
  await persist();
  if (queue.length) void flush();
}

/** Turn ids in a screen path into placeholders, e.g. /round/abc123/results → /round/:id/results. */
export const screenName = (path: string) =>
  (path || '/')
    .split('/')
    .map((s) => (s && (/\d/.test(s) && s.length >= 6 ? ':id' : s)))
    .join('/')
    .slice(0, 60);

let lastOpen = 0;
/** Call once from the root layout: app opens, screen views and sending in the background. */
export function useUsageTracking(pathname: string) {
  useEffect(() => {
    void load().then(() => {
      lastOpen = Date.now();
      track('app_open');
    });
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - lastOpen > 30 * 60_000) {
        lastOpen = Date.now();
        track('app_open');
      }
      if (s === 'background') void flush();
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    const name = screenName(pathname);
    if (name === currentScreen) return;
    currentScreen = name;
    track('screen_view');
  }, [pathname]);
}

/** The More-tab switch: "Share anonymous usage data". */
export function useUsageSharing(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(!off);
  useEffect(() => {
    void load().then(() => setOn(!off));
    listeners.add(setOn);
    return () => void listeners.delete(setOn);
  }, []);
  const set = (v: boolean) => {
    off = !v;
    if (off) queue = [];
    void AsyncStorage.setItem(OFF_KEY, off ? '1' : '0');
    void persist();
    listeners.forEach((l) => l(v));
  };
  return [on, set];
}
