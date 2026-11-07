/**
 * Upload scorecard: photo of a finished card → check the scores → set up the round as usual → results.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Body, Button, Card, Field, H2, Label } from '@/components/ui';
import { today } from '@/lib/dates';
import { holesOnCard, readRoundPhoto, setPendingScan, suggestPlayer, type ScannedRound } from '@/lib/round-scan';
import { useMe } from '@/lib/me';
import { pickScorecard } from '@/lib/scan';
import { track } from '@/lib/usage';
import { useStore } from '@/store/store';
import { radius, space, useColors } from '@/theme';

const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];

function ScoreCell({ value, unsure, onChange, label }: { value: number | null; unsure: boolean; onChange: (v: number | null) => void; label: string }) {
  const c = useColors();
  return (
    <TextInput
      value={value === null ? '' : String(value)}
      onChangeText={(t) => {
        const n = parseInt(t.replace(/[^0-9]/g, '').slice(0, 2), 10);
        onChange(Number.isFinite(n) && n > 0 ? n : null);
      }}
      keyboardType="number-pad"
      selectTextOnFocus
      accessibilityLabel={label}
      style={{
        flex: 1, flexBasis: 0, minWidth: 0, height: 36, textAlign: 'center', fontSize: 15, fontWeight: '700', color: c.text, padding: 0,
        borderWidth: unsure ? 2 : 1, borderColor: unsure ? c.brandGold : c.border, borderRadius: radius.sm,
        backgroundColor: unsure ? '#B4895422' : c.card,
      }}
    />
  );
}

export default function UploadScorecard() {
  const c = useColors();
  const [phase, setPhase] = useState<'pick' | 'reading' | 'review'>('pick');
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<ScannedRound | null>(null);
  const { isMe } = useMe();
  // Me and my friends (and people I've played with), to match names on the card.
  const people = useStore((s) => s.players);

  const read = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const photo = await pickScorecard(source);
      if (!photo) return;
      setPhase('reading');
      const read = await readRoundPhoto(photo);
      // The date written on the card, if there is one (and it isn't in the future); otherwise today.
      const onCard = read.date && /^\d{4}-\d{2}-\d{2}$/.test(read.date) && read.date <= today() ? read.date : today();
      setCard({ ...read, date: onCard });
      setPhase('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('pick');
    }
  };

  const setRow = (i: number, patch: Partial<ScannedRound['rows'][number]>) =>
    setCard((cd) => (cd ? { ...cd, rows: cd.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : cd));
  const setScore = (i: number, h: number, v: number | null) =>
    setCard((cd) =>
      cd ? { ...cd, rows: cd.rows.map((r, j) => (j === i ? { ...r, scores: r.scores.map((s, k) => (k === h - 1 ? v : s)), unsure: r.unsure.filter((u) => u !== h) } : r)) } : cd,
    );

  if (phase === 'reading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl }}>
        <ActivityIndicator size="large" color={c.primary} />
        <H2>Reading the scorecard…</H2>
        <Body muted style={{ textAlign: 'center' }}>This usually takes 10 to 20 seconds.</Body>
      </View>
    );
  }

  if (phase === 'pick' || !card) {
    return (
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Card style={{ gap: space.sm }}>
          <H2>Upload a scorecard</H2>
          <Body muted>Played a round without the app? Take a photo of the finished scorecard. We’ll read everyone’s scores, you check them, then set up the players and games as usual and go straight to the results.</Body>
          <Body muted>Tips: lay the card flat, in good light, with the whole card in the photo.</Body>
        </Card>
        {error ? <Body style={{ color: c.danger }}>{error}</Body> : null}
        <Button title="Take a photo" onPress={() => read('camera')} />
        <Button title="Choose from photos" kind="secondary" onPress={() => read('library')} />
      </ScrollView>
    );
  }

  const holes = holesOnCard(card);
  const nines = [FRONT, BACK].filter((n) => n.some((h) => holes.includes(h)));
  const unsureCount = card.rows.reduce((s, r) => s + r.unsure.length, 0);
  const ok = card.rows.length > 0 && card.rows.every((r) => r.name.trim());

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
      <Card style={{ gap: space.xs }}>
        <H2>Check the scores</H2>
        <Body muted>
          Tap any score to fix it.{unsureCount ? ` ${unsureCount} score${unsureCount === 1 ? ' was' : 's were'} hard to read and ${unsureCount === 1 ? 'is' : 'are'} outlined in gold.` : ''}
        </Body>
        {card.courseName ? <Label style={{ textTransform: 'none', letterSpacing: 0 }}>Course on the card: {card.courseName}</Label> : null}
        {card.notes ? <Label style={{ textTransform: 'none', letterSpacing: 0 }}>{card.notes}</Label> : null}
      </Card>
      <View style={{ flexDirection: 'row' }}>
        <DateField label="Date played" value={card.date ?? today()} max={today()} onChange={(d) => setCard({ ...card, date: d })} />
      </View>

      {card.rows.map((r, i) => {
        const total = (list: number[]) => list.reduce((s, h) => s + (r.scores[h - 1] ?? 0), 0);
        const taken = card.rows.filter((x, j) => j !== i && x.playerId).map((x) => x.playerId!);
        const linked = r.playerId ? people.find((p) => p.id === r.playerId) : undefined;
        const guess = r.playerId === undefined ? suggestPlayer(r.name, people, taken) : null;
        const who = (p: { id: string; name: string }) => `${p.name}${isMe(p.id) ? ' (you)' : ''}`;
        return (
          <Card key={i} style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
              <Field label={`Row ${i + 1} name`} value={r.name} onChangeText={(t) => setRow(i, { name: t, playerId: undefined })} />
              <Pressable onPress={() => setCard({ ...card, rows: card.rows.filter((_, j) => j !== i) })} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove row ${i + 1}`} style={{ paddingBottom: 12 }}>
                <Text style={{ color: c.danger, fontWeight: '600' }}>Remove</Text>
              </Pressable>
            </View>
            {/* Same name as me or a friend: ask if it's them, so they're added to the round for you. */}
            {guess && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.sm }}>
                <Text style={{ flex: 1, color: c.text, fontWeight: '600' }}>Is this {who(guess)}?</Text>
                <Pressable onPress={() => setRow(i, { playerId: guess.id })} accessibilityRole="button" accessibilityLabel={`Yes, row ${i + 1} is ${guess.name}`} style={{ backgroundColor: c.primary, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 14 }}>
                  <Text style={{ color: c.onPrimary, fontWeight: '700' }}>Yes</Text>
                </Pressable>
                <Pressable onPress={() => setRow(i, { playerId: null })} accessibilityRole="button" accessibilityLabel={`No, row ${i + 1} is not ${guess.name}`} style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 14, backgroundColor: c.card }}>
                  <Text style={{ color: c.text, fontWeight: '700' }}>No</Text>
                </Pressable>
              </View>
            )}
            {linked && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Text style={{ flex: 1, color: c.primary, fontWeight: '700' }}>✓ {who(linked)}</Text>
                <Pressable onPress={() => setRow(i, { playerId: null })} hitSlop={8} accessibilityRole="button">
                  <Text style={{ color: c.muted, fontWeight: '600' }}>Not them</Text>
                </Pressable>
              </View>
            )}
            {nines.map((nine) => (
              <View key={nine[0]} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', gap: 3 }}>
                  {nine.map((h) => <Text key={h} style={{ flex: 1, textAlign: 'center', color: c.muted, fontSize: 11 }}>{h}</Text>)}
                  <Text style={{ width: 40, textAlign: 'center', color: c.muted, fontSize: 11, fontWeight: '700' }}>{nine[0] === 1 ? 'OUT' : 'IN'}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
                  {nine.map((h) => (
                    <ScoreCell key={h} value={r.scores[h - 1]} unsure={r.unsure.includes(h)} onChange={(v) => setScore(i, h, v)} label={`${r.name || `Row ${i + 1}`} hole ${h}`} />
                  ))}
                  <Text style={{ width: 40, textAlign: 'center', color: c.text, fontWeight: '800' }}>{total(nine) || '–'}</Text>
                </View>
              </View>
            ))}
            {nines.length > 1 && <Label style={{ textTransform: 'none', letterSpacing: 0, textAlign: 'right' }}>Total {total([...FRONT, ...BACK])}</Label>}
          </Card>
        );
      })}

      <Button
        title="Next: set up the round"
        disabled={!ok}
        onPress={() => {
          setPendingScan(card);
          track('scorecard_upload_reviewed', { rows: card.rows.length, holes: holes.length });
          router.push({ pathname: '/new-round', params: { scan: '1' } });
        }}
      />
      <Button title="Use a different photo" kind="ghost" onPress={() => { setCard(null); setPhase('pick'); }} />
    </ScrollView>
  );
}
