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
import { gameHoles, grossAt, scoreKeys, teeFor } from '@/lib/round';
import { ScoreCell } from '@/components/score-cell';
import { guessRows, readRoundPhoto, type ScannedRound } from '@/lib/round-scan';
import { pickScorecard } from '@/lib/scan';
import { track } from '@/lib/usage';
import { useRound, useStore } from '@/store/store';
import { radius, space, useColors } from '@/theme';

const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];
const ALL = [...FRONT, ...BACK];

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

  const total = (i: number, holesIn: number[] = ALL) => holesIn.reduce((t, h) => t + (card.rows[i].scores[h - 1] ?? 0), 0);
  const used = Object.values(picks).filter((i): i is number => i !== null && i !== undefined);
  const anyPicked = used.length > 0;
  // Which player each card row is (picks are player → row).
  const keyForRow = (i: number) => Object.keys(picks).find((k) => picks[k] === i) ?? null;
  const assign = (row: number, key: string | null) =>
    setPicks((p) => {
      const next = { ...p };
      for (const k of Object.keys(next)) if (next[k] === row) next[k] = null;
      if (key) next[key] = row;
      return next;
    });
  const setCell = (i: number, h: number, v: number | null) =>
    setCard((cd) => (cd ? { ...cd, rows: cd.rows.map((row, j) => (j === i ? { ...row, scores: row.scores.map((x, k) => (k === h - 1 ? v : x)), unsure: row.unsure.filter((u) => u !== h) } : row)) } : cd));
  // The nines to show: those the round plays or that have scores on the card.
  const nines = [FRONT, BACK].filter((n) => n.some((h) => holes.includes(h) || card.rows.some((row) => row.scores[h - 1] != null)));
  let tee: ReturnType<typeof teeFor> | null = null;
  try { tee = teeFor(r, r.players[0].id); } catch { /* course missing */ }
  const par = (h: number) => tee?.holes[h - 1]?.par;
  // Scores already entered that the card will replace.
  const replacing = Object.entries(picks).reduce((n, [key, i]) => n + (i === null || i === undefined ? 0 : holes.filter((h) => card.rows[i].scores[h - 1] != null && grossAt(r, key, h) !== null && grossAt(r, key, h) !== card.rows[i].scores[h - 1]).length), 0);
  const unmatched = mine.filter((k) => picks[k.key] === null || picks[k.key] === undefined);

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
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={{ backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.md, gap: 4 }}>
          <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>
            <Text style={{ fontWeight: '800' }}>Here’s the card as we read it.</Text> Pick who each row is (we’ve guessed from the names). Tap any score to fix it.
          </Text>
          {card.rows.some((row) => row.unsure.length) ? <Text style={{ color: c.muted, fontSize: 12 }}>Scores outlined in gold were hard to read: worth a check.</Text> : null}
        </View>

        {card.rows.map((row, i) => {
          const who = keyForRow(i);
          const whoLabel = who ? keys.find((k) => k.key === who)?.label : null;
          return (
            <Card key={i} style={{ gap: space.sm, borderWidth: who ? 2 : 1, borderColor: who ? c.primary : c.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: c.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>ON THE CARD</Text>
                  <Text numberOfLines={1} style={{ color: c.text, fontSize: 17, fontWeight: '800' }}>{row.name || `Row ${i + 1}`}</Text>
                </View>
                <Text style={{ color: c.text, fontSize: 20, fontWeight: '800' }}>{total(i) || '–'}</Text>
              </View>

              {nines.map((nine) => (
                <View key={nine[0]} style={{ gap: 2 }}>
                  <View style={{ flexDirection: 'row', gap: 3 }}>
                    {nine.map((h) => <Text key={h} style={{ flex: 1, textAlign: 'center', color: holes.includes(h) ? c.muted : c.border, fontSize: 11, fontWeight: '700' }}>{h}</Text>)}
                    <Text style={{ width: 40, textAlign: 'center', color: c.muted, fontSize: 11, fontWeight: '800' }}>{nine[0] === 1 ? 'OUT' : 'IN'}</Text>
                  </View>
                  {tee && (
                    <View style={{ flexDirection: 'row', gap: 3 }}>
                      {nine.map((h) => <Text key={h} style={{ flex: 1, textAlign: 'center', color: c.muted, fontSize: 10 }}>{par(h) ?? ''}</Text>)}
                      <Text style={{ width: 40, textAlign: 'center', color: c.muted, fontSize: 10 }}>{nine.reduce((t, h) => t + (par(h) ?? 0), 0)}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
                    {nine.map((h) => (
                      <ScoreCell key={h} value={row.scores[h - 1]} unsure={row.unsure.includes(h)} onChange={(v) => setCell(i, h, v)} label={`${row.name || `Row ${i + 1}`} hole ${h}`} />
                    ))}
                    <Text style={{ width: 40, textAlign: 'center', color: c.text, fontWeight: '800' }}>{total(i, nine) || '–'}</Text>
                  </View>
                </View>
              ))}

              <Text style={{ color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 2 }}>THIS IS</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {mine.map((k) => {
                  const sel = who === k.key;
                  const elsewhere = !sel && picks[k.key] !== null && picks[k.key] !== undefined;
                  return (
                    <Pressable key={k.key} onPress={() => assign(i, sel ? null : k.key)} accessibilityRole="button" accessibilityState={{ selected: sel }} accessibilityLabel={`Row ${row.name || i + 1} is ${k.label}`}
                      style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: sel ? c.primary : c.border, backgroundColor: sel ? c.primary : c.card, opacity: elsewhere ? 0.45 : 1 }}>
                      <Text style={{ color: sel ? c.onPrimary : c.text, fontWeight: '700', fontSize: 14 }}>{sel ? '✓ ' : ''}{k.label}</Text>
                    </Pressable>
                  );
                })}
                <Pressable onPress={() => assign(i, null)} accessibilityRole="button" accessibilityState={{ selected: !who }}
                  style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: !who ? c.muted : c.border, backgroundColor: !who ? c.chip : c.card }}>
                  <Text style={{ color: c.muted, fontWeight: '700', fontSize: 14 }}>Not in this round</Text>
                </Pressable>
              </View>
              {whoLabel ? <Text style={{ color: c.primary, fontSize: 12, fontWeight: '700' }}>These scores go to {whoLabel}.</Text> : null}
            </Card>
          );
        })}

        {locked.length > 0 && (
          <Text style={{ color: c.muted, fontSize: 13 }}>
            🔒 {locked.map((k) => k.label).join(', ')}: not in your match, so their scores can only be entered by players in it.
          </Text>
        )}
      </ScrollView>
      <View style={{ padding: space.lg, gap: 6, backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.border }}>
        {unmatched.length > 0 && anyPicked ? <Text style={{ color: c.muted, textAlign: 'center', fontSize: 13 }}>No row picked for {unmatched.map((k) => k.label.split(' ')[0]).join(', ')}.</Text> : null}
        {replacing > 0 ? <Text style={{ color: c.muted, textAlign: 'center', fontSize: 13 }}>{replacing} score{replacing === 1 ? '' : 's'} already entered will be replaced by the card.</Text> : null}
        <Button title="Add these scores to the round" disabled={!anyPicked} onPress={save} />
      </View>
    </View>
  );
}
