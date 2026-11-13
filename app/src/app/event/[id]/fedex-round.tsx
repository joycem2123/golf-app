/**
 * One round of a Points Race season: each player's place, Stableford, finishing bonus and Race points, and what the
 * round did to their season (did it make their best rounds, and what it replaced).
 */
import { roundGain } from '@golf/engine';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { fmtPts, ordinal, usePlayerName } from '@/components/fedex-standings';
import { Card, Label } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { fedexResults } from '@/lib/fedex';
import { useMe } from '@/lib/me';
import { useEvent, useStore } from '@/store/store';
import { fonts, space, useColors } from '@/theme';

export { ErrorBoundary } from '@/components/error-screen';

export default function FedexRound() {
  const c = useColors();
  const { id, rid } = useLocalSearchParams<{ id: string; rid: string }>();
  const e = useEvent(id);
  const rounds = useStore((s) => s.rounds);
  const results = useMemo(() => (e ? fedexResults(e, rounds) : []), [e, rounds]);
  const name = usePlayerName();
  const { isMe } = useMe();
  const idx = results.findIndex((r) => r.round.id === rid);
  const r = results[idx];
  if (!e?.fedex || !r) return null;
  const cfg = e.fedex;
  const col = (w: number) => ({ width: w, textAlign: 'right' as const });
  const head = { color: c.muted, fontSize: 10, fontWeight: '800' as const, letterSpacing: 1 };
  const impact = r.rows.map((row) => ({ row, g: roundGain(results, cfg, 'season', row.playerId, r.round.id) }));

  return (
    <>
      <Stack.Screen options={{ title: `Round ${idx + 1} · ${formatDate(r.round.date, { month: 'short', day: 'numeric' })}` }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}>
        <Card style={{ paddingVertical: space.sm, gap: 0 }}>
          <Label>Race points this round · {r.half === 1 ? '1st' : '2nd'} half</Label>
          <View style={{ flexDirection: 'row', paddingVertical: 6 }}>
            <Text style={[head, { width: 36 }]}>POS</Text>
            <Text style={[head, { flex: 1 }]}>PLAYER</Text>
            <Text style={[head, col(44)]}>STBL</Text>
            <Text style={[head, col(54)]}>BONUS</Text>
            <Text style={[head, col(50)]}>RACE</Text>
          </View>
          {r.rows.map((row) => (
            <Pressable key={row.playerId} onPress={() => router.push({ pathname: '/event/[id]/fedex-player', params: { id: e.id, pid: row.playerId } })}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: c.border, marginHorizontal: -space.md, paddingHorizontal: space.md, backgroundColor: isMe(row.playerId) ? c.primarySoft : pressed ? c.chip : undefined })}>
              <Text style={{ width: 36, fontFamily: fonts.serif, fontWeight: '700', color: c.text }}>{row.tied ? 'T' : ''}{row.place}</Text>
              <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontWeight: '600', fontSize: 15 }}>{name(row.playerId)}</Text>
              <Text style={[col(44), { color: c.text }]}>{row.stableford}</Text>
              <Text style={[col(54), { color: row.bonus ? c.primary : c.muted }]}>{row.bonus ? `+${fmtPts(row.bonus)}` : '–'}</Text>
              <Text style={[col(50), { fontFamily: fonts.serif, fontWeight: '700', color: c.text, fontSize: 15 }]}>{fmtPts(row.cup)}</Text>
            </Pressable>
          ))}
          <Text style={{ color: c.muted, fontSize: 12, marginTop: 6, lineHeight: 17 }}>
            Race points = Stableford points + finishing bonus ({ordinal(1)} +{fmtPts(cfg.bonus[0] ?? 0)}, {ordinal(2)} +{fmtPts(cfg.bonus[1] ?? 0)} …). Players who tie share the bonuses of the places they cover.
          </Text>
        </Card>

        <Card style={{ gap: 6 }}>
          <Label>What it did to the season standings</Label>
          {impact.map(({ row, g }) => (
            <Text key={row.playerId} style={{ color: c.muted, fontSize: 13, lineHeight: 19 }}>
              <Text style={{ color: c.text, fontWeight: '700' }}>{name(row.playerId)}</Text>{' '}
              {g.added <= 0
                ? `${fmtPts(row.cup)} doesn’t count (their ${ordinal(cfg.best.season)} best is ${fmtPts(g.replaced ?? 0)}).`
                : g.replaced !== null
                  ? `${fmtPts(row.cup)} replaces a ${fmtPts(g.replaced)} in their best ${cfg.best.season} (+${fmtPts(g.added)}).`
                  : `${fmtPts(row.cup)} counts in full (+${fmtPts(g.added)}).`}
            </Text>
          ))}
        </Card>
      </ScrollView>
    </>
  );
}
