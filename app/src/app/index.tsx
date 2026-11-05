import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { Body, Button, Card, H2, Label, styles } from '@/components/ui';
import { gameName } from '@/lib/games';
import { courseFor, evaluate, holesComplete, isResult, shortCourseName } from '@/lib/round';
import { useStore, type RoundRecord } from '@/store/store';
import { space, useColors } from '@/theme';

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
  const active = rounds.filter((r) => r.status === 'active');
  const done = rounds.filter((r) => r.status === 'complete');

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
      <Button title="Start a New Round" onPress={() => router.push('/new-round')} />
      <Button title="Players" kind="secondary" onPress={() => router.push('/players')} />

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
