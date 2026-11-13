/**
 * A Points Race season's standings: 1st Half | 2nd Half | Season, each adding up every player's best rounds of Cup
 * points (Stableford + finishing bonus). Opens on the half being played. Tap a player for their rounds, or a round
 * for its results.
 */
import { fedexStandings, type FedexPart } from '@golf/engine';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Label, Segmented } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { currentHalf, fedexResults, importedGuests } from '@/lib/fedex';
import { useMe } from '@/lib/me';
import { useStore, type EventRecord, type RoundRecord } from '@/store/store';
import { fonts, space, useColors } from '@/theme';

export const fmtPts = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString());
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

export function usePlayerName() {
  const players = useStore((s) => s.players);
  return (id: string) => players.find((p) => p.id === id)?.name ?? 'Player';
}

export function FedexStandings({ e, rounds }: { e: EventRecord; rounds: RoundRecord[] }) {
  const c = useColors();
  const cfg = e.fedex!;
  const results = useMemo(() => fedexResults(e, rounds), [e, rounds]);
  const [part, setPart] = useState<FedexPart>(() => (currentHalf(e, results) === 2 ? 'second' : 'first'));
  const name = usePlayerName();
  const { isMe } = useMe();
  const players = useStore((s) => s.players);
  const rows = fedexStandings(results, cfg, part, e.playerIds);
  const n = part === 'first' ? cfg.best.first : part === 'second' ? cfg.best.second : cfg.best.season;
  const halfRounds = results.filter((r) => part === 'season' || r.half === (part === 'first' ? 1 : 2));
  const range = halfRounds.length ? `${formatDate(halfRounds[0].round.date, { month: 'short', day: 'numeric' })} – ${formatDate(halfRounds.at(-1)!.round.date, { month: 'short', day: 'numeric' })}` : '';
  const col = (w: number) => ({ width: w, textAlign: 'right' as const });

  const guests = e.remote?.role === 'viewer' ? [] : importedGuests(e, players);
  return (
    <>
      {guests.length ? (
        <Pressable onPress={() => router.push({ pathname: '/event/[id]/match-players', params: { id: e.id } })} accessibilityRole="button"
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.primary, borderRadius: 10, padding: space.md, opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ fontSize: 20 }}>🔗</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>Match players to your friends</Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>{guests.length} imported player{guests.length === 1 ? '' : 's'} aren’t linked to anyone on Clutch Up yet.</Text>
          </View>
          <Text style={{ color: c.primary, fontSize: 20 }}>›</Text>
        </Pressable>
      ) : null}
      <Segmented<FedexPart> options={[{ value: 'first', label: '1st Half' }, { value: 'second', label: '2nd Half' }, { value: 'season', label: 'Season' }]} value={part} onChange={setPart} />
      <Card style={{ paddingVertical: space.sm, gap: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Label>{part === 'first' ? '1st half' : part === 'second' ? '2nd half' : 'Season'} standings{range ? ` · ${range}` : ''}</Label>
          <Text style={{ color: c.muted, fontSize: 12 }}>best {n} rounds</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
          <Text style={{ width: 24 }} />
          <Text style={{ flex: 1, color: c.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>PLAYER</Text>
          <Text style={[col(54), { color: c.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 }]}>PTS</Text>
          <Text style={[col(36), { color: c.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 }]}>RDS</Text>
          <Text style={[col(44), { color: c.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 }]}>AVG</Text>
          <Text style={[col(44), { color: c.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 }]}>{ordinal(n).toUpperCase()}</Text>
        </View>
        {rows.length === 0 || halfRounds.length === 0 ? (
          <Text style={{ color: c.muted, paddingVertical: space.sm }}>{part === 'second' && results.length ? 'The 2nd half hasn’t started yet.' : 'No finished rounds yet. Standings appear after the first round.'}</Text>
        ) : (
          rows.map((r) => (
            <Pressable key={r.playerId} onPress={() => router.push({ pathname: '/event/[id]/fedex-player', params: { id: e.id, pid: r.playerId } })} accessibilityRole="button"
              accessibilityLabel={`${ordinal(r.position)}, ${name(r.playerId)}, ${fmtPts(r.points)} points from ${r.played} rounds`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: c.border, marginHorizontal: -space.md, paddingHorizontal: space.md, backgroundColor: isMe(r.playerId) ? c.primarySoft : pressed ? c.chip : undefined })}>
              <Text style={{ width: 24, fontFamily: fonts.serif, fontWeight: '700', color: c.text }}>{r.played ? r.position : ''}</Text>
              <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontWeight: isMe(r.playerId) ? '700' : '600', fontSize: 15 }}>{name(r.playerId)}</Text>
              <Text style={[col(54), { fontFamily: fonts.serif, fontWeight: '700', color: c.text, fontSize: 15 }]}>{fmtPts(r.points)}</Text>
              <Text style={[col(36), { color: c.text }]}>{r.played}</Text>
              <Text style={[col(44), { color: c.text }]}>{r.played ? r.average.toFixed(1) : '–'}</Text>
              <Text style={[col(44), { color: c.muted }]}>{r.cutoff !== null ? fmtPts(r.cutoff) : '–'}</Text>
            </Pressable>
          ))
        )}
        <Text style={{ color: c.muted, fontSize: 12, marginTop: 6 }}>Tap a player to see which rounds count. Ties go to the better {ordinal(n)} best round.</Text>
      </Card>

      {results.length ? (
        <Card style={{ paddingVertical: space.sm, gap: 0 }}>
          <Label>Race points by round</Label>
          {[...results].reverse().slice(0, 12).map((r, i) => {
            const top = r.rows.filter((x) => x.place === 1);
            return (
              <Pressable key={r.round.id} onPress={() => router.push({ pathname: '/event/[id]/fedex-round', params: { id: e.id, rid: r.round.id } })} accessibilityRole="button"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: c.border, marginTop: i ? 0 : 6, opacity: pressed ? 0.6 : 1 })}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>Round {results.indexOf(r) + 1} · {formatDate(r.round.date, { month: 'short', day: 'numeric' })}</Text>
                  <Text style={{ color: c.muted, fontSize: 12 }}>{r.half === 1 ? '1st' : '2nd'} half{r.round.imported ? ' · imported' : ''} · {r.rows.length} players · won by {top.map((x) => name(x.playerId).split(' ')[0]).join(' & ')} ({top[0]?.stableford} pts)</Text>
                </View>
                <Text style={{ color: c.primary, fontSize: 18 }}>›</Text>
              </Pressable>
            );
          })}
        </Card>
      ) : null}
    </>
  );
}
