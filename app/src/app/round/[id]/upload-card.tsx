/**
 * Upload a scorecard into a round that's already set up (e.g. an event round): read the card,
 * match each player (or team) to a row, and the scores go in as if entered by hand.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Body, Button, Card, H2 } from '@/components/ui';
import { canEditKey, useAccountId, useEditRequests } from '@/lib/edit-rights';
import { useMe } from '@/lib/me';
import { gameHoles, grossAt, scoreKeys } from '@/lib/round';
import { guessRows, readRoundPhoto, type ScannedRound } from '@/lib/round-scan';
import { pickScorecard } from '@/lib/scan';
import { track } from '@/lib/usage';
import { useRound, useStore } from '@/store/store';
import { radius, space, useColors } from '@/theme';

export default function UploadCardIntoRound() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useRound(id);
  const setScore = useStore((s) => s.setScore);
  const uid = useAccountId();
  const { isMe } = useMe();
  const { requests, claimed } = useEditRequests(r);
  const [phase, setPhase] = useState<'pick' | 'reading' | 'match'>('pick');
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<ScannedRound | null>(null);
  const [picks, setPicks] = useState<Record<string, number | null>>({});

  const keys = useMemo(() => (r ? scoreKeys(r) : []), [r]);
  const holes = useMemo(() => (r ? [...new Set(r.games.flatMap(gameHoles))].sort((a, b) => a - b) : []), [r]);
  if (!r) return <Body>Round not found.</Body>;
  const rights = { uid, isMe, requests, claimed };
  const mine = keys.filter((k) => canEditKey(r, k.key, rights));
  const locked = keys.filter((k) => !canEditKey(r, k.key, rights));

  const read = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const photo = await pickScorecard(source);
      if (!photo) return;
      setPhase('reading');
      const got = await readRoundPhoto(photo);
      setCard(got);
      setPicks(guessRows(mine, got.rows));
      setPhase('match');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('pick');
    }
  };

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
          <Body muted>Kept score on paper? Take a photo of the card. We’ll read the scores, you match each row to a player, and they go straight into {r.label ?? 'this round'}.</Body>
          <Button title="Take a photo" onPress={() => read('camera')} />
          <Button kind="secondary" title="Choose from photos" onPress={() => read('library')} />
          {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
        </Card>
      </ScrollView>
    );
  }

  const total = (i: number) => card.rows[i].scores.reduce<number>((s, v) => s + (v ?? 0), 0);
  const used = Object.values(picks).filter((i): i is number => i !== null && i !== undefined);
  const dupes = new Set(used).size !== used.length;
  const anyPicked = used.length > 0;
  // Scores already entered that the card will replace.
  const replacing = Object.entries(picks).reduce((n, [key, i]) => n + (i === null || i === undefined ? 0 : holes.filter((h) => card.rows[i].scores[h - 1] != null && grossAt(r, key, h) !== null && grossAt(r, key, h) !== card.rows[i].scores[h - 1]).length), 0);

  const save = () => {
    let n = 0;
    for (const [key, i] of Object.entries(picks)) {
      if (i === null || i === undefined) continue;
      for (const h of holes) {
        const g = card.rows[i].scores[h - 1];
        if (g == null) continue;
        setScore(r.id, key, h, g);
        n++;
      }
    }
    track('scorecard_uploaded_into_round', { rows: used.length, scores: n });
    router.back();
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 40 }}>
        <View style={{ backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.md }}>
          <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>
            <Text style={{ fontWeight: '800' }}>Match each player to their row on the card.</Text> We’ve guessed from the names; tap a different row to change it.
          </Text>
        </View>
        {mine.map((k) => (
          <Card key={k.key} style={{ gap: space.sm }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{k.label}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {card.rows.map((row, i) => {
                const sel = picks[k.key] === i;
                return (
                  <Pressable key={i} onPress={() => setPicks((p) => ({ ...p, [k.key]: sel ? null : i }))} accessibilityRole="button" accessibilityState={{ selected: sel }} accessibilityLabel={`${k.label}: ${row.name || `Row ${i + 1}`}`}
                    style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: sel ? c.primary : c.border, backgroundColor: sel ? c.primary : c.card }}>
                    <Text style={{ color: sel ? c.onPrimary : c.text, fontWeight: '700', fontSize: 14 }}>{row.name || `Row ${i + 1}`} · {total(i)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        ))}
        {locked.length > 0 && (
          <Text style={{ color: c.muted, fontSize: 13 }}>
            🔒 {locked.map((k) => k.label).join(', ')}: not in your match, so their scores can only be entered by players in it.
          </Text>
        )}
      </ScrollView>
      <View style={{ padding: space.lg, gap: 6, backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.border }}>
        {dupes ? <Text style={{ color: c.danger, textAlign: 'center', fontSize: 13 }}>Each row on the card can only be used once.</Text> : null}
        {!dupes && replacing > 0 ? <Text style={{ color: c.muted, textAlign: 'center', fontSize: 13 }}>{replacing} score{replacing === 1 ? '' : 's'} already entered will be replaced by the card.</Text> : null}
        <Button title="Add these scores to the round" disabled={!anyPicked || dupes} onPress={save} />
      </View>
    </View>
  );
}
