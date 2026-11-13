/**
 * A player in a Points Race season: where they stand in each half and the season, what their next round has to beat
 * to count, and every round they've played with the ones in their best rounds ticked.
 */
import { fedexStandings, type FedexPart } from '@golf/engine';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { fmtPts, ordinal, usePlayerName } from '@/components/fedex-standings';
import { Card, Label, Segmented } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { currentHalf, fedexResults } from '@/lib/fedex';
import { useMe } from '@/lib/me';
import { useEvent, useStore } from '@/store/store';
import { fonts, space, useColors } from '@/theme';

export { ErrorBoundary } from '@/components/error-screen';

export default function FedexPlayer() {
  const c = useColors();
  const { id, pid } = useLocalSearchParams<{ id: string; pid: string }>();
  const e = useEvent(id);
  const rounds = useStore((s) => s.rounds);
  const results = useMemo(() => (e ? fedexResults(e, rounds) : []), [e, rounds]);
  const name = usePlayerName();
  const { isMe } = useMe();
  const [part, setPart] = useState<FedexPart>('season');
  if (!e?.fedex) return null;
  const cfg = e.fedex;
  const parts: FedexPart[] = ['season', 'first', 'second'];
  const mine = Object.fromEntries(parts.map((p) => [p, fedexStandings(results, cfg, p, e.playerIds).find((r) => r.playerId === pid)!]));
  const label = { season: 'Season', first: '1st half', second: '2nd half' } as const;
  const n = part === 'first' ? cfg.best.first : part === 'second' ? cfg.best.second : cfg.best.season;
  const counted = new Set(mine[part]?.counted ?? []);
  const played = results.filter((r) => r.rows.some((x) => x.playerId === pid)).reverse();
  const now = currentHalf(e, results) === 2 ? 'second' : 'first';
  const you = isMe(pid);
  const target = (p: FedexPart) => mine[p]?.cutoff;

  return (
    <>
      <Stack.Screen options={{ title: name(pid) }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {parts.map((p) => (
            <Card key={p} style={{ flex: 1, alignItems: 'center', paddingVertical: space.sm, gap: 2 }}>
              <Label>{label[p]}</Label>
              <Text style={{ fontFamily: fonts.serif, fontWeight: '700', fontSize: 22, color: c.text }}>{mine[p]?.played ? ordinal(mine[p].position) : '–'}</Text>
              <Text style={{ color: c.muted, fontSize: 12 }}>{fmtPts(mine[p]?.points ?? 0)} pts</Text>
            </Card>
          ))}
        </View>
        {target('season') != null || target(now) != null ? (
          <Card style={{ backgroundColor: c.primarySoft, borderColor: c.primary }}>
            <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>
              {you ? 'Your' : `${name(pid).split(' ')[0]}’s`} next round counts
              {target(now) != null ? <> toward the {label[now]} if it beats <Text style={{ fontFamily: fonts.serif, fontWeight: '700' }}>{fmtPts(target(now)!)}</Text></> : ' toward the ' + label[now] + ' whatever the score'}
              {target('season') != null ? <>, and toward the season if it beats <Text style={{ fontFamily: fonts.serif, fontWeight: '700' }}>{fmtPts(target('season')!)}</Text></> : ''}.
            </Text>
          </Card>
        ) : null}
        <Segmented<FedexPart> options={[{ value: 'first', label: '1st Half' }, { value: 'second', label: '2nd Half' }, { value: 'season', label: 'Season' }]} value={part} onChange={setPart} />
        <Card style={{ paddingVertical: space.sm, gap: 0 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Label>Rounds ({mine[part]?.played ?? 0} played)</Label>
            <Text style={{ color: c.muted, fontSize: 12 }}>✓ = in best {n}</Text>
          </View>
          {played.filter((r) => part === 'season' || r.half === (part === 'first' ? 1 : 2)).map((r) => {
            const row = r.rows.find((x) => x.playerId === pid)!;
            const on = counted.has(r.round.id);
            return (
              <Pressable key={r.round.id} onPress={() => router.push({ pathname: '/event/[id]/fedex-round', params: { id: e.id, rid: r.round.id } })}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: c.border, opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ width: 64, color: c.muted }}>{formatDate(r.round.date, { month: 'short', day: 'numeric' })}</Text>
                <Text style={{ flex: 1, color: c.text, fontSize: 13 }}>{row.tied ? 'T' : ''}{ordinal(row.place)} · {row.stableford} pts{row.bonus ? ` +${fmtPts(row.bonus)}` : ''}</Text>
                <Text style={{ width: 52, textAlign: 'right', fontFamily: fonts.serif, fontWeight: '700', fontSize: 15, color: on ? c.primary : '#B9B3A6' }}>{fmtPts(row.cup)}</Text>
                <Text style={{ width: 24, textAlign: 'right', color: c.primary }}>{on ? '✓' : ''}</Text>
              </Pressable>
            );
          })}
          {!played.length ? <Text style={{ color: c.muted, paddingVertical: space.sm }}>No finished rounds yet.</Text> : null}
        </Card>
      </ScrollView>
    </>
  );
}
