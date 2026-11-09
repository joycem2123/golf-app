import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { Body, Card, H2, Label, styles } from '@/components/ui';
import { cupScore, eventPhase, eventStandings, formatPoints } from '@/lib/events';
import { gameName, matchLabel } from '@/lib/games';
import { courseFor, evaluate, holesComplete, isResult, shortCourseName } from '@/lib/round';
import { useStore, type EventRecord, type RoundRecord } from '@/store/store';
import { fonts, useColors } from '@/theme';

export function EventCard({ e, rounds, hint }: { e: EventRecord; rounds: RoundRecord[]; hint?: string }) {
  const c = useColors();
  const players = useStore((s) => s.players);
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  let line: React.ReactNode;
  if (e.teams) {
    const s = cupScore(e, rounds).standings;
    line = (
      <Text style={{ fontFamily: fonts.serif, fontSize: 20, fontWeight: '700' }}>
        <Text style={{ color: c.teamA }}>{e.teams.A.name} {formatPoints(s.teamA)}</Text>
        <Text style={{ color: c.muted }}>  –  </Text>
        <Text style={{ color: c.teamB }}>{formatPoints(s.teamB)} {e.teams.B.name}</Text>
      </Text>
    );
  } else {
    const top = eventStandings(e, rounds)[0];
    const done = eventPhase(e, rounds) === 'completed';
    const pts = top ? `${formatPoints(top.points)} pt${top.points === 1 ? '' : 's'}` : '';
    line = <Body bold>{top && top.played ? `${name(top.playerId)} ${done ? 'won' : 'leads'} with ${pts}` : `${e.playerIds.length} players`}</Body>;
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
          {main && isResult(main) ? (
            <Body bold style={{ color: main.finished ? c.primary : c.text }}>{main.summary}</Body>
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
