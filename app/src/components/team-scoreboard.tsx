/**
 * Where the team match stands in this round (and, in an event, the overall score), for the full scorecard.
 */
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { cupScore, eventTeamTotals, formatPoints } from '@/lib/events';
import { liveTeamScore } from '@/lib/results';
import { evaluate } from '@/lib/round';
import { useStore, type EventRecord, type RoundRecord } from '@/store/store';
import { fetchRoundEvent } from '@/sync/sync';
import { fonts, radius, space, teamColor, useColors } from '@/theme';

/** pinned: compact, edge to edge, for the top of the screen. */
export function TeamScoreboard({ r, results, pinned }: { r: RoundRecord; results: ReturnType<typeof evaluate>; pinned?: boolean }) {
  const c = useColors();
  const localEvent = useStore((s) => s.events.find((e) => e.id === r.eventId));
  const localRounds = useStore((s) => s.rounds);
  // Following just this round: fetch a read-only copy of the event (refreshed every minute).
  const [remote, setRemote] = useState<{ event: EventRecord; rounds: RoundRecord[] } | null>(null);
  const needRemote = !localEvent && !!r.eventId && !!r.remote;
  useEffect(() => {
    if (!needRemote) return;
    let alive = true;
    const load = () => void fetchRoundEvent(r.id).then((x) => alive && setRemote(x)).catch(() => undefined);
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [needRemote, r.id]);
  const event = localEvent ?? remote?.event;
  // This round from the phone (it's the most up to date), the event's other rounds from the server.
  const rounds = localEvent ? localRounds : remote ? [...remote.rounds.filter((x) => x.id !== r.id), r] : localRounds;
  const score = liveTeamScore(r, results);
  if (!score) return null;
  const first = (id: string) => (r.players.find((p) => p.id === id)?.name ?? '').split(' ')[0];
  const teamName = (L: string) => (event?.teams && (L === 'A' || L === 'B') ? event.teams[L].name : `Team ${L}`);
  const done = score.teams.reduce((s, t) => s + t.points, 0) > 0;
  const changes = score.live > 0;

  // Live line: "Team A ahead in 2, Team B in 1, 1 all square"
  const parts = score.teams.filter((t) => t.leading > 0).map((t) => `${teamName(t.letter)} ahead in ${t.leading}`);
  if (score.square) parts.push(`${score.square} all square`);

  // The whole event, when it's on this phone.
  let eventLine: string | null = null;
  if (event?.teams) {
    const s = cupScore(event, rounds).standings;
    eventLine = `${event.name}: ${event.teams.A.name} ${formatPoints(s.teamA)} – ${formatPoints(s.teamB)} ${event.teams.B.name}${s.toWin && !s.winner ? ` · ${formatPoints(s.toWin)} to win` : ''}`;
  } else if (event?.teamOf && (event.teamLetters?.length ?? 0) >= 2) {
    const { totals } = eventTeamTotals(event, rounds);
    eventLine = `${event.name}: ${[...totals].sort((a, b) => a.letter.localeCompare(b.letter)).map((t) => `Team ${t.letter} ${formatPoints(t.points)}`).join(' – ')}`;
  }

  return (
    <View style={pinned ? { backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border } : { backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
      <Text style={{ textAlign: 'center', color: c.muted, fontSize: pinned ? 10 : 11, fontWeight: '800', letterSpacing: 1.5, paddingTop: pinned ? 6 : space.sm }}>TEAM MATCH · THIS ROUND</Text>
      <View style={{ flexDirection: 'row', paddingHorizontal: space.sm, paddingVertical: pinned ? 6 : space.sm, gap: space.sm }}>
        {score.teams.map((t) => {
          const tc = teamColor(t.letter);
          return (
            <View key={t.letter} style={{ flex: 1, alignItems: 'center', paddingVertical: pinned ? 5 : space.sm, borderRadius: radius.md, backgroundColor: tc.color }}>
              <Text numberOfLines={1} style={{ color: '#fff', fontSize: pinned ? 11 : 12, fontWeight: '800', letterSpacing: 1 }}>{teamName(t.letter).toUpperCase()}</Text>
              <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: pinned ? 26 : 34, fontWeight: '700', lineHeight: pinned ? 30 : undefined }}>{formatPoints(t.points)}</Text>
              {changes && <Text style={{ color: '#ffffffd0', fontSize: pinned ? 11 : 12 }}>Projected {formatPoints(t.projected)}</Text>}
              <Text numberOfLines={pinned ? 1 : 2} style={{ color: '#ffffffc0', fontSize: pinned ? 10 : 11, textAlign: 'center', paddingHorizontal: 4, marginTop: 2 }}>{t.members.map(first).join(', ')}</Text>
            </View>
          );
        })}
      </View>
      <Text style={{ textAlign: 'center', color: c.text, fontSize: pinned ? 12 : 13, paddingHorizontal: space.md, paddingBottom: pinned ? 6 : space.sm }}>
        {changes ? `Live: ${parts.join(', ')}` : done ? 'All team matches finished' : 'No team matches started yet'}
      </Text>
      {eventLine && (
        <View style={{ backgroundColor: c.brand, paddingVertical: pinned ? 6 : 8, paddingHorizontal: space.md }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' }}>🏆 {eventLine}</Text>
        </View>
      )}
    </View>
  );
}
