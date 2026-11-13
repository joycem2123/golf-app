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
import { isMeId, useMe } from '@/lib/me';
import { useStore, type EventRecord, type RoundRecord } from '@/store/store';
import { fonts, space, useColors } from '@/theme';

export const fmtPts = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString());
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

export function usePlayerName() {
  const players = useStore((s) => s.players);
  const myPlayerId = useStore((s) => s.myPlayerId);
  // My own entry can be under an older id of mine (e.g. before I signed in): show my name for it too.
  return (id: string) => players.find((p) => p.id === id)?.name ?? (isMeId(id) ? players.find((p) => p.id === myPlayerId)?.name : undefined) ?? 'Player';
}

type Leader = { names: string[]; points: number; margin: number | null; tied: boolean };

/** Who leads a part of the season, by how much (null when there's no one to lead). */
function leaderOf(rows: ReturnType<typeof fedexStandings>, name: (id: string) => string): Leader | null {
  const played = rows.filter((r) => r.played > 0);
  if (!played.length) return null;
  const top = played.filter((r) => r.position === 1);
  const next = played.find((r) => r.position > 1);
  return { names: top.map((r) => name(r.playerId)), points: top[0].points, margin: next ? top[0].points - next.points : null, tied: top.length > 1 };
}

const marginText = (l: Leader, done: boolean) =>
  l.tied ? (done ? 'Shared the win' : 'Tied for the lead') : l.margin === null ? (done ? 'Won it' : 'Only player so far') : `${done ? 'Won by' : 'Leading by'} ${fmtPts(l.margin)} pt${l.margin === 1 ? '' : 's'}`;

/** The race at a glance: season leader, each half's winner or leader, and where I stand. */
export function RaceSummary({ e, rounds }: { e: EventRecord; rounds: RoundRecord[] }) {
  const c = useColors();
  const results = useMemo(() => fedexResults(e, rounds), [e, rounds]);
  const cfg = e.fedex!;
  const name = usePlayerName();
  const { isMe } = useMe();
  const first = name;
  const done = e.status === 'complete';
  const half = currentHalf(e, results);
  const season = fedexStandings(results, cfg, 'season', e.playerIds);
  const s = leaderOf(season, first);
  const h1 = leaderOf(fedexStandings(results, cfg, 'first', e.playerIds), first);
  const h2 = leaderOf(fedexStandings(results, cfg, 'second', e.playerIds), first);
  const h1Done = done || half === 2;
  const mine = season.find((r) => isMe(r.playerId) && r.played > 0);
  const top = season.find((r) => r.position === 1);
  const planned = (e.rounds ?? []).filter((p) => !p.roundId).length;
  const next = (e.rounds ?? []).filter((p) => !p.roundId && p.date && p.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0];
  const halfNote = cfg.half.kind === 'date' ? `2nd half from ${formatDate(cfg.half.date, { month: 'short', day: 'numeric' })}` : `2nd half after round ${cfg.half.count}`;

  const small = (label: string, l: Leader | null, finished: boolean, empty: string) => (
    <View style={{ flex: 1, backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: space.md, gap: 3 }}>
      <Text style={{ color: c.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }}>{label}</Text>
      {l ? (
        <>
          <Text style={{ color: c.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>{finished ? (l.tied ? 'CO-WINNERS' : '🏅 WINNER') : 'LEADER'}</Text>
          <Text numberOfLines={2} style={{ color: c.text, fontFamily: fonts.serif, fontWeight: '700', fontSize: 17 }}>{l.names.join(' & ')}</Text>
          <Text style={{ color: c.text, fontFamily: fonts.serif, fontWeight: '700', fontSize: 15 }}>{fmtPts(l.points)} pts</Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>{marginText(l, finished)}</Text>
        </>
      ) : <Text style={{ color: c.muted, fontSize: 13, marginTop: 4 }}>{empty}</Text>}
    </View>
  );

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ backgroundColor: c.brand, borderRadius: 12, padding: space.lg, gap: 4 }}>
        <Text style={{ color: '#F3E3B5', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>{done ? '🏆 SEASON CHAMPION' : 'SEASON LEADER'}</Text>
        {s ? (
          <>
            <Text style={{ color: '#fff', fontFamily: fonts.serif, fontWeight: '700', fontSize: 28 }}>{s.names.join(' & ')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
              <Text style={{ color: '#fff', fontFamily: fonts.serif, fontWeight: '700', fontSize: 20 }}>{fmtPts(s.points)} pts</Text>
              <Text style={{ color: '#ffffffc8', fontSize: 14 }}>{marginText(s, done)}</Text>
            </View>
          </>
        ) : <Text style={{ color: '#fff', fontSize: 16 }}>No rounds played yet.</Text>}
        <Text style={{ color: '#ffffffa8', fontSize: 12, marginTop: 4 }}>
          {[`${results.length} round${results.length === 1 ? '' : 's'} played`, done ? null : planned ? `${planned} to go` : null, done ? null : halfNote, !done && next?.date ? `next ${formatDate(next.date, { month: 'short', day: 'numeric' })}` : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {small('1ST HALF', h1, h1Done, 'No rounds yet.')}
        {small('2ND HALF', h2, done, half === 1 ? `Starts ${cfg.half.kind === 'date' ? formatDate(cfg.half.date, { month: 'short', day: 'numeric' }) : `after round ${cfg.half.count}`}.` : 'No rounds yet.')}
      </View>
      {mine && top && !isMe(top.playerId) ? (
        <Text style={{ color: c.muted, fontSize: 13, textAlign: 'center' }}>
          You’re {ordinal(mine.position)} in the season, {fmtPts(top.points - mine.points)} pts behind{mine.cutoff !== null ? ` · your next round counts if it beats ${fmtPts(mine.cutoff)}` : ''}.
        </Text>
      ) : null}
    </View>
  );
}

export function FedexStandings({ e, rounds }: { e: EventRecord; rounds: RoundRecord[] }) {
  const c = useColors();
  const cfg = e.fedex!;
  const results = useMemo(() => fedexResults(e, rounds), [e, rounds]);
  const [part, setPart] = useState<FedexPart>(() => (e.status === 'complete' ? 'season' : currentHalf(e, results) === 2 ? 'second' : 'first'));
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
