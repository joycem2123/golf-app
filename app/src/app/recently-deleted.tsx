/**
 * More → Recently deleted: rounds and events I deleted in the last 30 days, ready to restore exactly as they were
 * (scores, players, and a round's place in its event).
 */
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { Body, Button, Card } from '@/components/ui';
import { listDeleted, restoreDeleted, type DeletedItem } from '@/lib/trash';
import { useSession } from '@/sync/auth';
import { fonts, space, useColors } from '@/theme';

export { ErrorBoundary } from '@/components/error-screen';

const DAY = 864e5;
const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() + 30 * DAY - Date.now()) / DAY));
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function RecentlyDeleted() {
  const c = useColors();
  const session = useSession();
  const signedIn = !!session?.user;
  const [items, setItems] = useState<DeletedItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    listDeleted().then((x) => { if (live) setItems(x); }, (e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [signedIn]);

  const restore = async (it: DeletedItem) => {
    setBusy(it.id);
    setErr(null);
    try {
      await restoreDeleted(it);
      setItems((x) => (x ?? []).filter((y) => y.id !== it.id));
      setDone(it.kind === 'round' ? `${it.title}${it.event_name ? ` · ${it.event_name}` : ''} is back.` : `${it.title} is back.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}>
      <Stack.Screen options={{ title: 'Recently deleted' }} />
      <Body muted>Rounds and events you delete are kept here for 30 days. Restore one and it comes back exactly as it was: scores, players, and its place in its event.</Body>
      {done ? (
        <Card style={{ gap: space.sm }}>
          <Text style={{ color: c.primary, fontWeight: '700' }}>✓ {done}</Text>
          <Button small kind="secondary" title="Go to Scores" onPress={() => router.push('/scores')} />
        </Card>
      ) : null}
      {err ? <Text style={{ color: c.danger }}>{err}</Text> : null}
      {!signedIn ? <Body muted>Sign in to see rounds and events you’ve deleted.</Body> : items === null && !err ? <ActivityIndicator color={c.primary} /> : null}
      {items?.length === 0 ? <Body muted style={{ textAlign: 'center' }}>Nothing deleted in the last 30 days.</Body> : null}
      {items?.map((it) => (
        <Card key={it.id} style={{ gap: space.sm }}>
          <View>
            <Text style={{ color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>{it.kind === 'round' ? 'ROUND' : 'EVENT'}</Text>
            <Text style={{ color: c.text, fontFamily: fonts.serif, fontWeight: '700', fontSize: 18 }}>{it.title}{it.event_name ? ` · ${it.event_name}` : ''}</Text>
            {it.players ? <Text numberOfLines={2} style={{ color: c.text, fontSize: 14 }}>{it.players}</Text> : null}
            <Text style={{ color: c.muted, fontSize: 13 }}>
              Deleted {when(it.deleted_at)}{it.kind === 'round' ? ` · ${it.holes_scored ? `${it.holes_scored} hole${it.holes_scored === 1 ? '' : 's'} scored` : 'no scores yet'}` : ''} · {daysLeft(it.deleted_at)} days left
            </Text>
          </View>
          <Button small title={busy === it.id ? 'Restoring…' : 'Restore'} disabled={busy !== null} onPress={() => void restore(it)} />
        </Card>
      ))}
    </ScrollView>
  );
}
