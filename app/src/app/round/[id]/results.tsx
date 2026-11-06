import { summarizeStats } from '@golf/engine';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, View } from 'react-native';

import { GameSummaryCard } from '@/components/game-summary';
import { Body, Button, Card, H1, H2, Label, styles } from '@/components/ui';
import { gameName } from '@/lib/games';
import { courseFor, evaluate, grossAt, postingList, teeFor } from '@/lib/round';
import { useRound, useStore } from '@/store/store';
import { space } from '@/theme';

export default function Results() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useRound(id);
  const reopen = useStore((s) => s.reopenRound);
  const del = useStore((s) => s.deleteRound);
  if (!r) return <Body>Round not found.</Body>;

  const results = evaluate(r);
  const posting = postingList(r);
  const name = (pid: string) => r.players.find((p) => p.id === pid)?.name ?? pid;
  const totals = r.players.map((p) => {
    const scores = Array.from({ length: 18 }, (_, i) => grossAt(r, p.id, i + 1));
    const played = scores.filter((s): s is number => s !== null);
    return { p, scores, gross: played.reduce((a, b) => a + b, 0), holes: played.length };
  });

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}>
      <View>
        <H1>{gameName(r.games[0])}</H1>
        <Body muted>{courseFor(r).name} · {new Date(r.createdAt).toLocaleDateString()}</Body>
      </View>

      {r.games.map((g, i) => (
        <GameSummaryCard key={i} name={gameName(g)} result={results[i]} players={r.players} />
      ))}

      {totals.some((t) => t.holes > 0) && (
        <Card>
          <H2>Scores</H2>
          {totals.filter((t) => t.holes > 0).map((t) => (
            <View key={t.p.id} style={[styles.row, { justifyContent: 'space-between' }]}>
              <Body>{t.p.name}</Body>
              <Body bold>{t.gross}{t.holes < 18 ? ` (${t.holes} holes)` : ''}</Body>
            </View>
          ))}
        </Card>
      )}

      {r.statsEnabled &&
        totals.filter((t) => t.holes > 0).map((t) => {
          const s = summarizeStats(t.scores, r.stats[t.p.id] ?? [], teeFor(r, t.p.id).holes);
          return (
            <Card key={t.p.id}>
              <H2>{t.p.name} · stats</H2>
              <Body muted>
                Putts {s.putts} ({s.puttsPerHole}/hole) · Fairways {s.fairwaysHit}/{s.fairwayAttempts} · GIR {s.girHit}/{s.girAttempts}
              </Body>
              <Body muted>
                Birdies {s.scoring.birdies + s.scoring.eaglesOrBetter} · Pars {s.scoring.pars} · Bogeys {s.scoring.bogeys} · Double+ {s.scoring.doubleOrWorse}
              </Body>
            </Card>
          );
        })}

      {posting.length > 0 && (
        <Card>
          <H2>Post your scores</H2>
          <Body muted>Remember to post this round to Golf Canada:</Body>
          <Body bold>{posting.map(name).join(', ')}</Body>
          <Label style={{ textTransform: 'none' }}>Automatic posting comes once Golf Canada access is available.</Label>
        </Card>
      )}

      <Button title="Done" onPress={() => router.dismissTo('/')} />
      <Button
        title="Reopen scorecard"
        kind="secondary"
        onPress={() => {
          reopen(r.id);
          router.replace(`/round/${r.id}`);
        }}
      />
    </ScrollView>
  );
}
