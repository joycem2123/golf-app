import { greenInRegulation, type FairwayResult, type NassauConfig, type WolfConfig, type WolfResult } from '@golf/engine';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { GameSummaryCard } from '@/components/game-summary';
import { Body, Button, Card, Chip, H2, Label, Stepper, styles } from '@/components/ui';
import { gameName } from '@/lib/games';
import { courseFor, evaluate, grossAt, isResult, recordedMatches, scoreKeys, shortCourseName, teeFor, type ScoreKey } from '@/lib/round';
import { useRound, useStore, type RoundRecord } from '@/store/store';
import { radius, space, useColors } from '@/theme';

function scoreColor(c: ReturnType<typeof useColors>, diff: number) {
  if (diff <= -1) return c.primary;
  if (diff >= 2) return c.danger;
  return c.text;
}

function ScoreRow({ r, k, hole, strokes }: { r: RoundRecord; k: ScoreKey; hole: number; strokes: number }) {
  const c = useColors();
  const setScore = useStore((s) => s.setScore);
  const setStats = useStore((s) => s.setStats);
  const tee = teeFor(r, k.members[0]);
  const par = tee.holes[hole - 1].par;
  const gross = grossAt(r, k.key, hole);
  const stats = r.stats[k.key]?.[hole - 1] ?? null;
  const set = (v: number) => setScore(r.id, k.key, hole, Math.max(1, Math.min(15, v)));
  const setStat = (patch: object) => setStats(r.id, k.key, hole, { ...(stats ?? {}), ...patch });
  const fairways: [FairwayResult, string][] = [['left', '←'], ['hit', 'Hit'], ['right', '→']];

  return (
    <Card>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <View style={{ flex: 1 }}>
          <H2>{k.label}</H2>
          <Text style={{ color: c.muted, fontSize: 13 }}>
            {strokes > 0 ? `${'●'.repeat(strokes)} gets ${strokes === 1 ? 'a shot' : `${strokes} shots`}` : strokes < 0 ? 'gives a shot' : ' '}
            {gross !== null && strokes !== 0 ? `  ·  net ${gross - strokes}` : ''}
          </Text>
        </View>
        <View style={styles.row}>
          <Pressable onPress={() => gross !== null && set(gross - 1)} style={[styles.stepBtn, { backgroundColor: c.chip }]}>
            <Text style={{ color: c.primary, fontSize: 22, fontWeight: '700' }}>−</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${k.label} score`}
            onPress={() => gross === null && set(par)}
            onLongPress={() => setScore(r.id, k.key, hole, null)}
            style={{
              width: 54, height: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
              backgroundColor: gross === null ? c.chip : c.primarySoft, borderWidth: 2, borderColor: gross === null ? c.border : scoreColor(c, gross - par),
            }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: gross === null ? c.muted : scoreColor(c, gross - par) }}>
              {gross ?? '–'}
            </Text>
          </Pressable>
          <Pressable onPress={() => set(gross === null ? par : gross + 1)} style={[styles.stepBtn, { backgroundColor: c.chip }]}>
            <Text style={{ color: c.primary, fontSize: 22, fontWeight: '700' }}>+</Text>
          </Pressable>
        </View>
      </View>

      {r.statsEnabled && !k.isTeam && (
        <View style={{ gap: space.sm, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.sm }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Label>Putts</Label>
            <Stepper
              value={stats?.putts ?? -1}
              min={-1}
              max={6}
              format={(v) => (v < 0 ? '–' : String(v))}
              onChange={(v) => setStat({ putts: stats?.putts == null ? (v < 0 ? 1 : 2) : Math.max(0, v) })}
            />
          </View>
          {par >= 4 && (
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Label>Fairway</Label>
              <View style={styles.row}>
                {fairways.map(([v, label]) => (
                  <Chip key={v} label={label} selected={stats?.fairway === v} onPress={() => setStat({ fairway: v })} />
                ))}
              </View>
            </View>
          )}
          {gross !== null && stats?.putts != null && (
            <Label style={{ textTransform: 'none' }}>
              Green in regulation: {greenInRegulation(gross, stats.putts, par) ? 'Yes' : 'No'}
            </Label>
          )}
        </View>
      )}
    </Card>
  );
}

function WolfPanel({ r, index, result, hole }: { r: RoundRecord; index: number; result: WolfResult; hole: number }) {
  const updateGame = useStore((s) => s.updateGame);
  const game = r.games[index] as WolfConfig;
  const name = (id: string) => r.players.find((p) => p.id === id)?.name ?? id;
  const entry = result.holes[hole - 1];
  if (!entry) {
    return (
      <Card>
        <H2>Wolf</H2>
        <Body muted>Finish the earlier holes to see who’s the wolf here.</Body>
      </Card>
    );
  }
  const decision = game.decisions[hole - 1] ?? null;
  const decide = (d: WolfConfig['decisions'][number]) => {
    const decisions = [...game.decisions];
    decisions[hole - 1] = d;
    updateGame(r.id, index, { ...game, decisions });
  };
  return (
    <Card>
      <H2>🐺 {name(entry.wolfId)} is the wolf</H2>
      <Label style={{ textTransform: 'none' }}>Pick a partner, go lone wolf after tee shots, or blind wolf before anyone tees off.</Label>
      <View style={styles.wrap}>
        {game.order
          .filter((id) => id !== entry.wolfId)
          .map((id) => (
            <Chip key={id} label={`+ ${name(id)}`} selected={decision?.mode === 'partner' && decision.partnerId === id} onPress={() => decide({ mode: 'partner', partnerId: id })} />
          ))}
        <Chip label="Lone wolf" selected={decision?.mode === 'lone'} onPress={() => decide({ mode: 'lone' })} />
        <Chip label="Blind wolf" selected={decision?.mode === 'blind'} onPress={() => decide({ mode: 'blind' })} />
      </View>
    </Card>
  );
}

function NassauPress({ r, index, hole }: { r: RoundRecord; index: number; hole: number }) {
  const updateGame = useStore((s) => s.updateGame);
  const game = r.games[index] as NassauConfig;
  const segment = hole <= 9 ? 'front' : 'back';
  const presses = game.presses ?? [];
  const add = (seg: 'front' | 'back' | 'overall') =>
    updateGame(r.id, index, { ...game, presses: [...presses, { segment: seg, startHole: hole }] });
  return (
    <Card>
      <H2>Nassau presses</H2>
      {presses.length > 0 ? (
        <Body muted>{presses.map((p) => `${p.segment} from ${p.startHole}`).join(' · ')}</Body>
      ) : (
        <Body muted>A press starts a new bet from this hole to the end of the nine.</Body>
      )}
      <View style={styles.row}>
        <Button small kind="secondary" title={`Press ${segment} 9 from #${hole}`} onPress={() => add(segment)} />
        <Button small kind="ghost" title="Press 18" onPress={() => add('overall')} />
      </View>
      {presses.length > 0 && (
        <Button small kind="ghost" title="Undo last press" onPress={() => updateGame(r.id, index, { ...game, presses: presses.slice(0, -1) })} />
      )}
    </Card>
  );
}

export default function Scorecard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useRound(id);
  const c = useColors();
  const setHole = useStore((s) => s.setHole);
  const completeRound = useStore((s) => s.completeRound);
  const dismissNotices = useStore((s) => s.dismissNotices);

  if (!r) return <Body>Round not found.</Body>;

  const course = courseFor(r);
  const hole = r.currentHole;
  const keys = scoreKeys(r);
  const results = evaluate(r);
  const mainStrokes = isResult(results[0]) ? results[0].strokes : {};
  const firstTee = teeFor(r, r.players[0].id);
  const h = firstTee.holes[hole - 1];
  const done = (n: number) => keys.every((k) => grossAt(r, k.key, n) !== null);
  const allDone = Array.from({ length: 18 }, (_, i) => done(i + 1)).every(Boolean);

  const finish = () => {
    const go = () => {
      completeRound(r.id, recordedMatches(r, results.filter(isResult)));
      router.replace(`/round/${r.id}/results`);
    };
    if (allDone) return go();
    Alert.alert('Finish round?', 'Some holes have no score. Games will be scored on the holes played.', [
      { text: 'Keep scoring' },
      { text: 'Finish', onPress: go },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: shortCourseName(course.name) }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}>
        {r.notices.length > 0 && (
          <Card style={{ borderColor: c.accent, borderWidth: 2 }}>
            {r.notices.map((n, i) => (
              <Body key={i}>Hole {n.hole}: {n.key} changed from {n.replacedGross} to {n.keptGross}</Body>
            ))}
            <Button small kind="ghost" title="OK" onPress={() => dismissNotices(r.id)} />
          </Card>
        )}

        {/* Hole header */}
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Button small kind="secondary" title="‹ Prev" disabled={hole === 1} onPress={() => setHole(r.id, hole - 1)} />
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 30, fontWeight: '800', color: c.text }}>Hole {hole}</Text>
            <Text style={{ color: c.muted, fontWeight: '600' }}>Par {h.par} · SI {h.strokeIndex} · {h.yards} yds</Text>
          </View>
          <Button small kind="secondary" title="Next ›" disabled={hole === 18} onPress={() => setHole(r.id, hole + 1)} />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
            <Pressable key={n} onPress={() => setHole(r.id, n)} hitSlop={3}>
              <View
                style={{
                  width: 13, height: 13, borderRadius: 7,
                  backgroundColor: n === hole ? c.accent : done(n) ? c.primary : c.chip,
                  borderWidth: 1, borderColor: n === hole ? c.accent : c.border,
                }}
              />
            </Pressable>
          ))}
        </View>
        <Label style={{ textTransform: 'none', textAlign: 'center' }}>Tap the box to enter par, then use − / +. Hold the box to clear.</Label>

        {r.games.map((g, i) => {
          const res = results[i];
          if (g.type === 'wolf' && res && isResult(res) && res.type === 'wolf') return <WolfPanel key={i} r={r} index={i} result={res} hole={hole} />;
          return null;
        })}

        {keys.map((k) => (
          <ScoreRow key={k.key} r={r} k={k} hole={hole} strokes={mainStrokes[k.key]?.[hole - 1] ?? 0} />
        ))}

        {hole < 18 && done(hole) && <Button title={`Next hole: ${hole + 1} ›`} onPress={() => setHole(r.id, hole + 1)} />}

        {r.games.map((g, i) => (g.type === 'nassau' ? <NassauPress key={i} r={r} index={i} hole={hole} /> : null))}

        <Label>Live games</Label>
        {r.games.map((g, i) => (
          <GameSummaryCard key={i} name={gameName(g)} result={results[i]} players={r.players} />
        ))}

        <Button title="Finish round" kind={allDone ? 'primary' : 'secondary'} onPress={finish} />
      </ScrollView>
    </>
  );
}
