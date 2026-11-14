/**
 * An Individual points season: the leader at a glance, and the standings (everyone's own total from every match and
 * game they've played, whatever the format or partner). Tap a player for where their points came from.
 */
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { describePlaces } from '@/components/fedex-setup';
import { ordinal, usePlayerName } from '@/components/fedex-standings';
import { Card, H2, Label } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { fmtIndividual, individualRounds, individualTable } from '@/lib/individual';
import { useMe } from '@/lib/me';
import type { EventRecord, RoundRecord } from '@/store/store';
import { fonts, space, useColors } from '@/theme';

const pts = (n: number) => `${fmtIndividual(n)} pt${n === 1 ? '' : 's'}`;

export function IndividualSummary({ e, rounds }: { e: EventRecord; rounds: RoundRecord[] }) {
  const c = useColors();
  const name = usePlayerName();
  const { isMe } = useMe();
  const rows = useMemo(() => individualTable(e, rounds), [e, rounds]);
  const played = useMemo(() => individualRounds(e, rounds).length, [e, rounds]);
  const done = e.status === 'complete';
  const active = rows.filter((r) => r.rounds > 0);
  const top = active.filter((r) => r.position === 1);
  const next = active.find((r) => r.position > 1);
  const margin = top.length && next ? top[0].points - next.points : null;
  const mine = active.find((r) => isMe(r.playerId));
  const planned = (e.rounds ?? []).filter((p) => !p.roundId).length;
  const upcoming = (e.rounds ?? []).filter((p) => !p.roundId && p.date && p.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0];
  const marginText = top.length > 1 ? (done ? 'Shared the win' : 'Tied for the lead') : margin === null ? (done ? 'Won it' : 'Only player so far') : `${done ? 'Won by' : 'Leading by'} ${pts(margin)}`;
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ backgroundColor: c.brand, borderRadius: 12, padding: space.lg, gap: 4 }}>
        <Text style={{ color: '#F3E3B5', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>{done ? '🏆 SEASON CHAMPION' : 'SEASON LEADER'}</Text>
        {top.length ? (
          <>
            <Text style={{ color: '#fff', fontFamily: fonts.serif, fontWeight: '700', fontSize: 28 }}>{top.map((r) => name(r.playerId)).join(' & ')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
              <Text style={{ color: '#fff', fontFamily: fonts.serif, fontWeight: '700', fontSize: 20 }}>{pts(top[0].points)}</Text>
              <Text style={{ color: '#ffffffc8', fontSize: 14 }}>{marginText}</Text>
            </View>
          </>
        ) : <Text style={{ color: '#fff', fontSize: 16 }}>No rounds played yet.</Text>}
        <Text style={{ color: '#ffffffa8', fontSize: 12, marginTop: 4 }}>
          {['Individual points', `${played} round${played === 1 ? '' : 's'} played`, done ? null : planned ? `${planned} to go` : null, !done && upcoming?.date ? `next ${formatDate(upcoming.date, { month: 'short', day: 'numeric' })}` : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {mine && top.length && !top.some((t) => t.playerId === mine.playerId) ? (
        <Text style={{ color: c.muted, fontSize: 13, textAlign: 'center' }}>You’re {ordinal(mine.position)}, {pts(top[0].points - mine.points)} behind.</Text>
      ) : null}
    </View>
  );
}

export function IndividualStandings({ e, rounds }: { e: EventRecord; rounds: RoundRecord[] }) {
  const c = useColors();
  const name = usePlayerName();
  const { isMe } = useMe();
  const rows = useMemo(() => individualTable(e, rounds), [e, rounds]);
  const col = (w: number) => ({ width: w, textAlign: 'right' as const });
  return (
    <Card style={{ gap: 0 }}>
      <H2>Standings</H2>
      <View style={{ flexDirection: 'row', paddingTop: space.sm, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Label style={{ flex: 1 }}>Player</Label>
        <Label style={col(40)}>Rds</Label>
        <Label style={col(64)}>W-L-H</Label>
        <Label style={col(52)}>Pts</Label>
      </View>
      {rows.map((r) => (
        <Pressable key={r.playerId} onPress={() => router.push({ pathname: '/event/[id]/individual-player', params: { id: e.id, pid: r.playerId } })}
          accessibilityRole="button" accessibilityLabel={`${name(r.playerId)}, ${ordinal(r.position)}, ${fmtIndividual(r.points)} points`}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 })}>
          <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 15, fontWeight: isMe(r.playerId) ? '800' : '500' }}>
            <Text style={{ color: c.muted }}>{r.rounds ? `${r.position}. ` : '–  '}</Text>{name(r.playerId)}{isMe(r.playerId) ? ' (you)' : ''}
          </Text>
          <Text style={[col(40), { color: c.muted }]}>{r.rounds}</Text>
          <Text style={[col(64), { color: c.muted }]}>{r.wins}-{r.losses}-{r.halves}</Text>
          <Text style={[col(52), { fontFamily: fonts.serif, fontWeight: '700', fontSize: 17, color: r.position === 1 && r.rounds ? c.primary : c.text }]}>{fmtIndividual(r.points)}</Text>
        </Pressable>
      ))}
      <Text style={{ color: c.muted, fontSize: 12, lineHeight: 17, paddingTop: space.sm }}>
        Matches: win 1, halve ½ to every player on the side (a Nassau pays its points). Other games: {describePlaces(e.individual?.places ?? [])}. Tap a player to see where their points came from.
      </Text>
    </Card>
  );
}
