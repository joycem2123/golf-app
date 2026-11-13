/**
 * More → Course changes (team only): every scorecard change players have saved to their own copy of a course,
 * newest first, with exactly what changed. Mark each one reviewed (with an optional note) once it's been checked.
 */
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { Body, Button, Card, Segmented } from '@/components/ui';
import { loadCourseChanges, markReviewed, type CourseChange } from '@/lib/admin';
import { fonts, radius, space, useColors } from '@/theme';

export { ErrorBoundary } from '@/components/error-screen';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function ChangeCard({ ch, onDone }: { ch: CourseChange; onDone: () => void }) {
  const c = useColors();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Group the changes by tee: "Black (men)" → ["rating 70.9 → 71.2", "hole 4 par 4 → 5"].
  const groups = new Map<string, string[]>();
  for (const x of ch.changes) {
    const line = x.field === 'tee added' ? `added (${String(x.to)})` : x.field === 'tee removed' ? 'removed' : `${x.hole ? `Hole ${x.hole} ` : ''}${x.field}: ${x.from ?? '–'} → ${x.to ?? '–'}`;
    groups.set(x.tee ?? 'Course', [...(groups.get(x.tee ?? 'Course') ?? []), line]);
  }
  return (
    <Card style={{ gap: space.sm }}>
      <View>
        <Text style={{ color: c.text, fontFamily: fonts.serif, fontWeight: '700', fontSize: 18 }}>{ch.course_name}</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>{ch.user_name ?? 'A player'} · {ch.method === 'photo' ? 'from a photo' : 'by hand'} · {when(ch.created_at)}</Text>
      </View>
      {[...groups.entries()].map(([tee, lines]) => (
        <View key={tee} style={{ gap: 2 }}>
          <Text style={{ color: c.primary, fontWeight: '800', fontSize: 13 }}>{tee}</Text>
          {lines.map((l, i) => <Text key={i} style={{ color: c.text, fontSize: 14 }}>• {l}</Text>)}
        </View>
      ))}
      {ch.reviewed_at ? (
        <View style={{ backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.sm }}>
          <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13 }}>✓ Reviewed {when(ch.reviewed_at)}</Text>
          {ch.review_note ? <Text style={{ color: c.text, fontSize: 13 }}>{ch.review_note}</Text> : null}
        </View>
      ) : (
        <>
          <TextInput value={note} onChangeText={setNote} placeholder="Note (optional), e.g. “Correct, card updated for everyone”" placeholderTextColor={c.muted}
            style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: space.sm, color: c.text, backgroundColor: c.bg }} />
          {err ? <Text style={{ color: c.danger, fontSize: 13 }}>{err}</Text> : null}
          <Button small title={busy ? 'Saving…' : 'Mark reviewed'} disabled={busy} onPress={async () => {
            setBusy(true); setErr(null);
            try { await markReviewed(ch.id, note); onDone(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
          }} />
        </>
      )}
    </Card>
  );
}

export default function CourseChanges() {
  const c = useColors();
  const [tab, setTab] = useState<'open' | 'all'>('open');
  const [items, setItems] = useState<CourseChange[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try { setItems(await loadCourseChanges(tab === 'open')); setErr(null); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [tab]);
  useEffect(() => {
    let live = true;
    loadCourseChanges(tab === 'open').then(
      (list) => { if (live) { setItems(list); setErr(null); } },
      (e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [tab]);
  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Stack.Screen options={{ title: 'Course changes' }} />
      <Body muted>Scorecard changes players saved to their own copy of a course. Nothing here changes the card for anyone else.</Body>
      <Segmented options={[{ value: 'open', label: 'To review' }, { value: 'all', label: 'All' }]} value={tab} onChange={(t) => { setItems(null); setTab(t); }} />
      {err ? <Text style={{ color: c.danger }}>{err}</Text> : null}
      {items === null && !err ? <ActivityIndicator color={c.primary} /> : null}
      {items?.length === 0 ? <Body muted style={{ textAlign: 'center' }}>{tab === 'open' ? 'Nothing to review. 🎉' : 'No changes yet.'}</Body> : null}
      {items?.map((ch) => <ChangeCard key={ch.id} ch={ch} onDone={() => void load()} />)}
    </ScrollView>
  );
}
