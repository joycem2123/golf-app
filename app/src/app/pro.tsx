import * as WebBrowser from 'expo-web-browser';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { LogoMark } from '@/components/logo';
import { Body, Button, Card } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { buyPro, canPurchase, getProOffer, PRO_PRICE_FALLBACK, restorePro, usePro } from '@/lib/pro';
import { track } from '@/lib/usage';
import { fonts, radius, space, useColors } from '@/theme';

export { ErrorBoundary } from '@/components/error-screen';

const REASONS: Record<string, string> = {
  event: 'Creating events is part of Clutch Up Pro. Your setup is saved, so you can finish it once you’re in.',
  story: 'Match and event stories are part of Clutch Up Pro.',
  scorecard: 'Scorecard uploads are part of Clutch Up Pro.',
};

const FEATURES: { icon: string; title: string; sub: string }[] = [
  { icon: '🏆', title: 'Events', sub: 'Trips, Ryder Cups and seasons with live standings, projections and schedules.' },
  { icon: '✨', title: 'Match & event stories', sub: 'A story of every match and event, written for you.' },
  { icon: '📷', title: 'Scorecard uploads', sub: 'Snap a filled-in card and get the results in seconds.' },
  { icon: '👥', title: 'Friends join free', sub: 'Anyone you bring into your events plays, scores and follows along free.' },
];

/** Clutch Up Pro: what's included, the price and trial, subscribe and restore. */
export default function ProScreen() {
  const c = useColors();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const { pro, paywall, until, betaUntil, willRenew } = usePro();
  const [offer, setOffer] = useState<Awaited<ReturnType<typeof getProOffer>>>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    track('pro_viewed', { reason: reason ?? 'more' });
    void getProOffer().then((o) => { setOffer(o); setLoading(false); });
  }, [reason]);

  const price = offer?.price ?? PRO_PRICE_FALLBACK;
  const trial = offer ? offer.trial : '7-day free trial';

  const subscribe = async () => {
    if (!offer) return setMsg(canPurchase() ? 'Couldn’t reach the App Store. Check your connection and try again.' : 'Update Clutch Up from TestFlight to subscribe.');
    setBusy(true);
    setMsg(null);
    try {
      const ok = await buyPro(offer.pkg);
      if (ok) {
        track('pro_purchased', { reason: reason ?? 'more' });
        router.back();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const ok = await restorePro();
      setMsg(ok ? 'Restored. You have Clutch Up Pro.' : 'No Clutch Up Pro subscription found for this Apple ID.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Already Pro: how and until when.
  const status = !paywall
    ? 'Everyone has every feature during the beta.'
    : until && new Date(until) > new Date()
      ? `${willRenew === false ? 'Ends' : 'Renews'} ${formatDate(until.slice(0, 10), { month: 'long', day: 'numeric', year: 'numeric' })}.`
      : betaUntil && new Date(betaUntil) > new Date()
        ? `Free for early testers until ${formatDate(betaUntil.slice(0, 10), { month: 'long', day: 'numeric', year: 'numeric' })}. Thank you!`
        : null;

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 }}>
      <Stack.Screen options={{ title: 'Clutch Up Pro' }} />
      <View style={{ alignItems: 'center', gap: space.sm, marginTop: space.sm }}>
        <LogoMark size={56} />
        <Text style={{ fontFamily: fonts.serif, fontSize: 28, fontWeight: '700', color: c.primary }}>Clutch Up Pro</Text>
        {reason && REASONS[reason] && !pro ? <Body muted style={{ textAlign: 'center' }}>{REASONS[reason]}</Body> : null}
      </View>

      <Card style={{ gap: space.md }}>
        {FEATURES.map((f) => (
          <View key={f.title} style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
            <Text style={{ fontSize: 22 }}>{f.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: '800', fontSize: 15 }}>{f.title}</Text>
              <Text style={{ color: c.muted, fontSize: 13 }}>{f.sub}</Text>
            </View>
          </View>
        ))}
      </Card>

      {pro ? (
        <Card style={{ alignItems: 'center', gap: 4, borderColor: c.accent, borderWidth: 1.5 }}>
          <Text style={{ color: c.primary, fontWeight: '800', fontSize: 17 }}>★ You have Clutch Up Pro</Text>
          {status ? <Body muted style={{ textAlign: 'center' }}>{status}</Body> : null}
        </Card>
      ) : (
        <View style={{ gap: space.sm }}>
          <View style={{ alignItems: 'center', backgroundColor: c.primarySoft, borderRadius: radius.lg, padding: space.md }}>
            {trial ? <Text style={{ color: c.primary, fontWeight: '800', fontSize: 18 }}>{trial}</Text> : null}
            <Text style={{ color: c.text, fontSize: 15 }}>{trial ? `then ${price}` : price}</Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>Cancel anytime</Text>
          </View>
          {loading ? <ActivityIndicator color={c.primary} /> : <Button title={busy ? 'Working…' : trial ? 'Start free trial' : 'Subscribe'} disabled={busy} onPress={() => void subscribe()} />}
        </View>
      )}

      {msg ? <Body style={{ textAlign: 'center', color: msg.startsWith('Restored') ? c.primary : c.danger }}>{msg}</Body> : null}
      <Button small kind="secondary" title="Restore purchases" disabled={busy} onPress={() => void restore()} />

      {/* What the App Store requires subscription screens to say. */}
      <Text style={{ color: c.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>
        {trial ? 'After the free trial, ' : ''}payment is charged to your Apple ID account at confirmation of purchase. The subscription renews automatically each year at {price.replace('/year', '')} unless cancelled at least 24 hours before the end of the current period. Manage or cancel any time in Settings → your name → Subscriptions.
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.lg }}>
        <Pressable onPress={() => void WebBrowser.openBrowserAsync('https://clutchupgolf.com/terms.html')} accessibilityRole="link"><Text style={{ color: c.primary, fontSize: 12, fontWeight: '700' }}>Terms of Use</Text></Pressable>
        <Pressable onPress={() => void WebBrowser.openBrowserAsync('https://clutchupgolf.com/privacy.html')} accessibilityRole="link"><Text style={{ color: c.primary, fontSize: 12, fontWeight: '700' }}>Privacy Policy</Text></Pressable>
      </View>
    </ScrollView>
  );
}
