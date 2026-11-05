import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { Body, Button, Card, H2, Label, styles } from '@/components/ui';
import { gameName } from '@/lib/games';
import { cupScore, eventStandings, formatPoints } from '@/lib/events';
import { courseFor, evaluate, holesComplete, isResult, shortCourseName } from '@/lib/round';
import { useStore, type EventRecord, type RoundRecord } from '@/store/store';
import { fonts, space, useColors } from '@/theme';
import { Text } from 'react-native';

function EventCard({ e, rounds }: { e: EventRecord; rounds: RoundRecord[] }) {
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
    line = <Body bold>{top && top.played ? `${name(top.playerId)} leads with ${formatPoints(top.points)} pts` : `${e.playerIds.length} players`}</Body>;
  }
  return (
    <Pressable onPress={() => router.push(`/event/${e.id}`)}>
      {({ pressed }) => (
        <Card style={{ opacity: pressed ? 0.7 : 1, borderLeftWidth: 4, borderLeftColor: c.accent }}>
          <Label>{e.type === 'cup' ? 'Ryder Cup' : e.type === 'trip' ? 'Trip' : 'Season'}</Label>
          <H2>{e.name}</H2>
          {line}
        </Card>
      )}
    </Pressable>
  );
}

function RoundCard({ r }: { r: RoundRecord }) {
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
          {r.games.length > 1 ? <Label style={{ textTransform: 'none' }}>+ {r.games.length - 1} side game{r.games.length > 2 ? 's' : ''}</Label> : null}
        </Card>
      )}
    </Pressable>
  );
}

export default function Home() {
  const rounds = useStore((s) => s.rounds);
  const events = useStore((s) => s.events);
  const active = rounds.filter((r) => r.status === 'active');
  const done = rounds.filter((r) => r.status === 'complete');

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
      <Button title="Start a New Round" onPress={() => router.push('/new-round')} />
      <View style={styles.row}>
        <View style={{ flex: 1 }}><Button title="New Event" kind="secondary" onPress={() => router.push('/new-event')} /></View>
        <View style={{ flex: 1 }}><Button title="Players" kind="secondary" onPress={() => router.push('/players')} /></View>
      </View>
      <Button title="Join with code" kind="secondary" onPress={() => router.push('/join')} />
      <View style={styles.row}>
        <View style={{ flex: 1 }}><Button title="Head to head" kind="ghost" onPress={() => router.push('/head-to-head')} /></View>
        <View style={{ flex: 1 }}><Button title="Account" kind="ghost" onPress={() => router.push('/account')} /></View>
      </View>

      {events.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Label>Events</Label>
          {events.map((e) => <EventCard key={e.id} e={e} rounds={rounds} />)}
        </View>
      )}

      {active.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Label>In progress</Label>
          {active.map((r) => <RoundCard key={r.id} r={r} />)}
        </View>
      )}

      {done.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Label>Completed</Label>
          {done.map((r) => <RoundCard key={r.id} r={r} />)}
        </View>
      )}

      {rounds.length === 0 && (
        <Card>
          <H2>No rounds yet</H2>
          <Body muted>Start a round to pick a course, add your group and choose your games. Scores save on your phone, even without signal.</Body>
        </Card>
      )}
    </ScrollView>
  );
}
