/**
 * Each account gets its own saved data on the phone. Signing in loads only
 * that account's rounds, events and friends; signing out switches to the
 * phone's guest data.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { EMPTY_DATA, STORE_VERSION, useStore } from './store';

export const GUEST_KEY = 'golf-app:guest';
/** Where everything was saved before accounts were separated. */
export const LEGACY_KEY = 'golf-app-v1';

export const accountKey = (userId: string | null | undefined, anonymous = false) =>
  !userId || anonymous ? GUEST_KEY : `golf-app:user:${userId}`;

let currentKey: string | null = null;
let switching: Promise<void> = Promise.resolve();

export const getAccountKey = () => currentKey;

/** Data saved before accounts were separated, waiting for its owner to claim it. */
export const useLegacy = create<{ available: boolean; rounds: number; players: number; events: number }>(() => ({
  available: false,
  rounds: 0,
  players: 0,
  events: 0,
}));

async function readBlob(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

const emptyBlob = () => JSON.stringify({ state: { ...EMPTY_DATA }, version: STORE_VERSION });

const hasData = (raw: string | null) => {
  if (!raw) return false;
  try {
    const s = JSON.parse(raw).state ?? {};
    return (s.rounds?.length ?? 0) + (s.players?.length ?? 0) + (s.events?.length ?? 0) > 0;
  } catch {
    return false;
  }
};

export async function checkLegacy() {
  const raw = await readBlob(LEGACY_KEY);
  if (!raw) return useLegacy.setState({ available: false, rounds: 0, players: 0, events: 0 });
  try {
    const s = JSON.parse(raw).state ?? {};
    useLegacy.setState({
      available: hasData(raw),
      rounds: s.rounds?.length ?? 0,
      players: s.players?.length ?? 0,
      events: s.events?.length ?? 0,
    });
  } catch {
    useLegacy.setState({ available: false });
  }
}

/**
 * Load the given account's data. `carryFrom` moves another key's data into a brand-new account
 * (a guest who creates an account keeps their history).
 */
export function switchAccount(key: string, opts: { carryFrom?: string } = {}): Promise<void> {
  switching = switching.then(async () => {
    if (key === currentKey && useStore.persist.hasHydrated()) return;
    let raw = await readBlob(key);
    if (!hasData(raw) && opts.carryFrom && opts.carryFrom !== key) {
      const carried = await readBlob(opts.carryFrom);
      if (hasData(carried)) {
        await AsyncStorage.setItem(key, carried!);
        await AsyncStorage.setItem(opts.carryFrom, emptyBlob());
        raw = carried;
      }
    }
    // A brand-new account starts empty, never with the previous account's data.
    if (!raw) await AsyncStorage.setItem(key, emptyBlob());
    currentKey = key;
    useStore.persist.setOptions({ name: key });
    await useStore.persist.rehydrate();
  });
  return switching;
}

/** Move the pre-separation data into the current account. */
export async function claimLegacy() {
  if (!currentKey) return;
  const raw = await readBlob(LEGACY_KEY);
  if (!raw) return;
  await AsyncStorage.setItem(currentKey, raw);
  await AsyncStorage.removeItem(LEGACY_KEY);
  await useStore.persist.rehydrate();
  await checkLegacy();
}

export async function dismissLegacy() {
  useStore.getState().setLegacyDismissed(true);
}

/** Remove everything this phone saved for an account (after the account is deleted). */
export async function forgetAccount(key: string) {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    /* nothing saved */
  }
}
