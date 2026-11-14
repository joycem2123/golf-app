/**
 * A player in an Individual points season: place, points (from matches and from places), record, and every round
 * with what they earned in each game. Tap a round for its results.
 */
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ordinal, usePlayerName } from '@/components/fedex-standings';
import { Card, Label } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { fmtIndividual, individualRounds, individualTable } from '@/lib/individual';
import { useEvent, useStore } from '@/store/store';
import { fonts, space, useColors } from '@/theme';

export { ErrorBoundary } from '@/components/error-screen';

export default function IndividualPlayer() {
  const c = useColors();
  const { id, pid } = useLocalSearchParams<{ id: string; pid: string }>();
  const e = useEvent(id);
  const rounds = useStore((s) => s.rounds);
  const name = usePlayerName();
  const table = useMemo(() => (e ? individualTable(e, rounds) : []), [e, rounds]);
  const list = useMemo(() => (e ? individualRounds(e, rounds) : []), [e, rounds]);
  if (!e?.individual) return null;
  const me = table.find((r) => r.playerId === pid);
  const mine = list.filter((x) => x.items[pid]?.length).reverse();
  const stat = (label: string, big: string, small?: string) => (
    <Card style={{ flex: 1, alignItems: 'center', paddingVertical: space.sm, gap: 2 }}>
      <Label>{label}</Label>
      <Text style={{ fontFamily: fonts.serif, fontWeight: '700', fontSize: 22, color: c.text }}>{big}</Text>
      {small ? <Text style={{ color: c.muted, fontSize: 12 }}>{small}</Text> : null}
    </Card>
  );
  return (
    <>
      <Stack.Screen options={{ title: name(pid) }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {stat('Place', me?.rounds ? ordinal(me.position) : '–', `of ${table.filter((r) => r.rounds).length}`)}
          {stat('Points', fmtIndividual(me?.points ?? 0), `${fmtIndividual(me?.matchPoints ?? 0)} match · ${fmtIndividual(me?.placePoints ?? 0)} place`)}
          {stat('Matches', `${me?.wins ?? 0}-${me?.losses ?? 0}-${me?.halves ?? 0}`, 'W-L-H')}
        </View>
        {mine.map(({ round, items }) => {
          const total = items[pid].reduce((s, i) => s + i.points, 0);
          return (
            <Pressable key={round.id} onPress={() => router.push(round.status === 'complete' ? `/round/${round.id}/results` : `/round/${round.id}`)} accessibilityRole="button"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <Card style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>
                    {round.label ?? 'Round'} <Text style={{ color: c.muted, fontWeight: '500', fontSize: 13 }}>· {formatDate(new Date(round.createdAt).toISOString().slice(0, 10), { month: 'short', day: 'numeric' })}</Text>
                  </Text>
                  <Text style={{ fontFamily: fonts.serif, fontWeight: '700', fontSize: 18, color: c.primary }}>+{fmtIndividual(total)}</Text>
                </View>
                {items[pid].map((i, k) => (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Text style={{ flex: 1, color: c.text, fontSize: 14 }}>
                      {i.game} <Text style={{ color: c.muted }}>· {i.kind === 'match' ? `${i.result === 'won' ? 'Won' : i.result === 'lost' ? 'Lost' : 'Halved'}${i.result === 'halved' ? '' : ` ${i.detail}`}` : i.detail}</Text>
                    </Text>
                    <Text style={{ color: i.points ? c.text : c.muted, fontWeight: '700', fontSize: 14 }}>+{fmtIndividual(i.points)}</Text>
                  </View>
                ))}
                <Text style={{ color: c.primary, fontSize: 13, fontWeight: '700', textAlign: 'right' }}>Round results ›</Text>
              </Card>
            </Pressable>
          );
        })}
        {!mine.length ? <Text style={{ color: c.muted, textAlign: 'center' }}>No finished games yet this season.</Text> : null}
      </ScrollView>
    </>
  );
}
