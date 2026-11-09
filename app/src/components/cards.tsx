import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { Body, Card, H2, Label, styles } from '@/components/ui';
import { cupScore, eventPhase, eventStandings, eventTeamTotals, formatPoints } from '@/lib/events';
import { roundTeamScore } from '@/lib/results';
import { gameName, matchLabel } from '@/lib/games';
import { courseFor, evaluate, holesComplete, isResult, shortCourseName } from '@/lib/round';
import { TeamScoreLine } from './team-score-line';
import { useStore, type EventRecord, type RoundRecord } from '@/store/store';
import { fonts, useColors } from '@/theme';
import { namesFor, teamName } from '@/lib/team-colors';

export function EventCard({ e, rounds, hint }: { e: EventRecord; rounds: RoundRecord[]; hint?: string }) {
  const c = useColors();
  const players = useStore((s) => s.players);
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  // The team score where there are teams (coloured by who's ahead); otherwise the leader, in plain text.
  const done = eventPhase(e, rounds) === 'completed';
  let line: React.ReactNode;
  if (e.teams) {
    const s = cupScore(e, rounds).standings;
    line = (
      <TeamScoreLine
        done={done || !!s.winner}
        teams={[{ letter: 'A', name: e.teams.A.name, points: s.teamA }, { letter: 'B', name: e.teams.B.name, points: s.teamB }]}
        picks={e.teamColors}
      />
    );
  } else if (e.teamOf && (e.teamLetters?.length ?? 0) >= 2) {
    const { totals } = eventTeamTotals(e, rounds);
    line = <TeamScoreLine picks={e.teamColors} done={done} teams={[...totals].sort((a, b) => a.letter.localeCompare(b.letter)).map((t) => ({ letter: t.letter, name: teamName(t.letter, namesFor(undefined, e)), points: t.points }))} />;
  } else {
    const top = eventStandings(e, rounds)[0];
    const pts = top ? `${formatPoints(top.points)} pt${top.points === 1 ? '' : 's'}` : '';
    line = <Body muted>{top && top.played ? `${name(top.playerId)} ${done ? 'won' : 'leads'} with ${pts}` : `${e.playerIds.length} players`}</Body>;
  }
  return (
    <Pressable onPress={() => router.push(`/event/${e.id}`)}>
      {({ pressed }) => (
        <Card style={{ opacity: pressed ? 0.7 : 1, borderLeftWidth: 4, borderLeftColor: c.accent }}>
          <Label>{e.type === 'cup' ? 'Ryder Cup' : e.type === 'trip' ? 'Trip' : 'Season'}</Label>
          <H2>{e.name}</H2>
          {line}
          {hint ? <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13 }}>{hint}</Text> : null}
        </Card>
      )}
    </Pressable>
  );
}

export function RoundCard({ r }: { r: RoundRecord }) {
  const c = useColors();
  const results = evaluate(r);
  const main = results[0];
  const thru = holesComplete(r);
  const date = new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const target = r.status === 'active' ? `/round/${r.id}` : `/round/${r.id}/results`;
  const team = roundTeamScore(r, results);
  const ev = useStore((st) => st.events.find((e) => e.id === r.eventId));
  const roundTeamName = (L: string) => teamName(L, namesFor(r, ev));
  return (
    <Pressable onPress={() => router.push(target as never)}>
      {({ pressed }) => (
        <Card style={{ opacity: pressed ? 0.7 : 1 }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Label>{shortCourseName(courseFor(r).name)}</Label>
            <Label>{r.status === 'active' ? (thru === 0 ? date : `Thru ${thru}`) : date}</Label>
          </View>
          <H2>{gameName(r.games[0])}</H2>
          <Body muted>{r.players.map((p) => p.name).join(', ')}</Body>
          {/* Team rounds: the team score, coloured by who's ahead. Otherwise the game's summary. */}
          {team ? (
            <TeamScoreLine picks={r.teamColors} done={r.status === 'complete'} teams={team.map((t) => ({ letter: t.letter, name: roundTeamName(t.letter), points: t.points }))} />
          ) : main && isResult(main) ? (
            <Body muted>{main.summary}</Body>
          ) : null}
          {(() => {
            const matches = r.games.filter((g) => matchLabel(g)).length;
            const extra = r.games.length - Math.max(matches, 1);
            const parts = [matches > 1 ? `${matches} matches` : null, extra > 0 ? `${extra} side game${extra > 1 ? 's' : ''}` : null].filter(Boolean);
            return parts.length ? <Label style={{ textTransform: 'none' }}>{parts.join(' · ')}</Label> : null;
          })()}
        </Card>
      )}
    </Pressable>
  );
}
