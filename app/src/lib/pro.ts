/**
 * Clutch Up Pro: $24.99/yr (7-day free trial) through the App Store, via RevenueCat.
 * Pro unlocks creating events, generating AI stories and uploading scorecards. Friends brought into an
 * event play, score and see everything free, but generating stories and uploading scorecards need their
 * own Pro (the server checks that too).
 *
 * While the paywall is off (until launch), everyone has Pro. The server is the source of truth (it also
 * enforces Pro); the App Store's answer is used straight after a purchase, until the server catches up.
 *
 * Purchases need the native part (TestFlight build 4 and later); elsewhere buying says to update.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { supabase } from '@/sync/supabase';

export const PRO_ENTITLEMENT = 'pro';
export const PRO_PRICE_FALLBACK = '$24.99/year';

interface ProState {
  /** Has Pro (or the paywall is off). */
  pro: boolean;
  /** The paywall is on (after launch). */
  paywall: boolean;
  /** Subscribed until (ISO), and the early-tester free year (ISO). */
  until: string | null;
  betaUntil: string | null;
  willRenew: boolean | null;
  loaded: boolean;
  /** Beta testers: see the app as a free user would (this phone only). */
  previewFree: boolean;
}

export const usePro = create<ProState>(() => ({ pro: true, paywall: false, until: null, betaUntil: null, willRenew: null, loaded: false, previewFree: false }));

// What the server said, before any "preview as a free user".
let serverPro = true;
const PREVIEW_KEY = 'pro:previewFree';
void AsyncStorage.getItem(PREVIEW_KEY).then((v) => {
  if (v === '1') usePro.setState({ previewFree: true, pro: false });
}).catch(() => undefined);

/** Beta testers: preview the app as a free (non-Pro) user on this phone, or go back. */
export function setPreviewFree(on: boolean) {
  void AsyncStorage.setItem(PREVIEW_KEY, on ? '1' : '0').catch(() => undefined);
  usePro.setState({ previewFree: on, pro: on ? false : serverPro });
}

/** Ask the server where I stand. */
export async function loadPro() {
  const { data, error } = await supabase.rpc('my_pro');
  if (error || !data) return;
  const d = data as { pro: boolean; paywall: boolean; until: string | null; beta_until: string | null; will_renew: boolean | null };
  serverPro = d.pro;
  // Previewing as free only makes sense during the beta; a real subscription always counts.
  const preview = usePro.getState().previewFree && !d.paywall && !(d.until && new Date(d.until) > new Date());
  usePro.setState({ pro: preview ? false : d.pro, paywall: d.paywall, until: d.until, betaUntil: d.beta_until, willRenew: d.will_renew, loaded: true });
}

/** Load once at start, and again whenever I sign in or out. */
export function useProStatus() {
  useEffect(() => {
    void loadPro();
    const { data } = supabase.auth.onAuthStateChange(() => { void loadPro(); void identify(); });
    return () => data.subscription.unsubscribe();
  }, []);
}

// ------------------------------------------------------------------ the App Store (RevenueCat)

type Pkg = { identifier: string; product: { priceString: string; currencyCode?: string; introPrice?: { priceString: string; periodNumberOfUnits?: number; periodUnit?: string } | null } };
type Purchases = {
  configure(c: { apiKey: string; appUserID?: string | null }): void;
  logIn(id: string): Promise<unknown>;
  getOfferings(): Promise<{ current: { availablePackages: Pkg[]; annual?: Pkg | null } | null }>;
  purchasePackage(p: Pkg): Promise<{ customerInfo: { entitlements: { active: Record<string, unknown> } } }>;
  restorePurchases(): Promise<{ entitlements: { active: Record<string, unknown> } }>;
};

let sdk: Purchases | null | undefined;
let configured = false;
/** The App Store SDK, set up for me — or null where this build can't buy. */
function purchases(): Purchases | null {
  if (sdk === undefined) {
    sdk = null;
    const key = (Constants.expoConfig?.extra as { revenuecatIosKey?: string } | undefined)?.revenuecatIosKey;
    if (Platform.OS === 'ios' && key) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { NativeModules } = require('react-native') as { NativeModules: Record<string, unknown> };
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        if (NativeModules.RNPurchases) sdk = (require('react-native-purchases') as { default: Purchases }).default;
      } catch {
        sdk = null;
      }
    }
  }
  if (sdk && !configured) {
    const key = (Constants.expoConfig?.extra as { revenuecatIosKey?: string }).revenuecatIosKey!;
    sdk.configure({ apiKey: key });
    configured = true;
    void identify();
  }
  return sdk;
}

export const canPurchase = () => purchases() !== null;

/** Tell the App Store side who I am (my Clutch Up account), so a purchase follows my account. */
async function identify() {
  const s = sdk && configured ? sdk : null;
  if (!s) return;
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (id) await s.logIn(id).catch(() => undefined);
}

/** The yearly plan, with its price and trial as the App Store shows them. */
export async function getProOffer(): Promise<{ pkg: Pkg; price: string; trial: string | null } | null> {
  const s = purchases();
  if (!s) return null;
  try {
    const o = await s.getOfferings();
    const pkg = o.current?.annual ?? o.current?.availablePackages[0];
    if (!pkg) return null;
    const intro = pkg.product.introPrice;
    const trial = intro && /0[.,]00|^Free/i.test(intro.priceString) && intro.periodNumberOfUnits ? `${intro.periodNumberOfUnits}-${(intro.periodUnit ?? 'day').toLowerCase()} free trial` : null;
    // "$24.99 CAD/year" — iPhone writes CAD and USD both as "$", so name the currency.
    const cur = pkg.product.currencyCode && !/[A-Z]{3}/.test(pkg.product.priceString) ? ` ${pkg.product.currencyCode}` : '';
    return { pkg, price: `${pkg.product.priceString}${cur}/year`, trial };
  } catch {
    return null;
  }
}

/** After buying or restoring: have the server check with the App Store, then reload. */
async function settle(activeNow: boolean) {
  if (activeNow) setPreviewFree(false);
  if (activeNow) usePro.setState({ pro: true });
  await supabase.functions.invoke('revenuecat', { body: { sync: true } }).catch(() => undefined);
  await loadPro();
  if (activeNow) usePro.setState({ pro: true });
}

/** Buy Pro. Resolves true when bought, false when cancelled; throws with a message otherwise. */
export async function buyPro(pkg: Pkg): Promise<boolean> {
  const s = purchases();
  if (!s) throw new Error('Update Clutch Up from TestFlight to subscribe.');
  await identify();
  try {
    const { customerInfo } = await s.purchasePackage(pkg);
    const active = !!customerInfo.entitlements.active[PRO_ENTITLEMENT];
    await settle(active);
    return active;
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return false;
    throw new Error((e as { message?: string }).message ?? 'The purchase didn’t go through.');
  }
}

/** Restore a subscription bought before (new phone, reinstall). Resolves whether Pro is active. */
export async function restorePro(): Promise<boolean> {
  const s = purchases();
  if (!s) throw new Error('Update Clutch Up from TestFlight to restore purchases.');
  await identify();
  const info = await s.restorePurchases();
  const active = !!info.entitlements.active[PRO_ENTITLEMENT];
  await settle(active);
  return active;
}

/** Did the server turn this down for want of Pro? (AI features answer 402.) */
export function needsProError(error: unknown, data?: unknown): boolean {
  const d = data as { needsPro?: boolean } | undefined;
  const ctx = (error as { context?: { status?: number } } | null)?.context;
  return d?.needsPro === true || ctx?.status === 402;
}

let paywalledAt = 0;
/** Show the Pro screen (e.g. after the server said a feature needs Pro). */
/** Free rounds hold up to this many players; bigger groups are part of Pro (rounds in an event are free for everyone). */
export const FREE_MAX_PLAYERS = 8;

export function openPaywall(reason: 'event' | 'story' | 'scorecard' | 'group' | 'expenses' | 'fedex') {
  paywalledAt = Date.now();
  router.push({ pathname: '/pro', params: { reason } });
}
/** Was the Pro screen just shown (so a "couldn't do it" message isn't needed)? */
export const justPaywalled = () => Date.now() - paywalledAt < 4000;
