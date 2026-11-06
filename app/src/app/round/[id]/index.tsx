import { greenInRegulation, type FairwayResult, type NassauConfig, type WolfConfig, type WolfResult } from '@golf/engine';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { useState } from 'react';

import { GameSummaryCard } from '@/components/game-summary';
import { ScorecardGrid } from '@/components/scorecard-grid';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { IdentityCard, MeBadge } from '@/components/people';
import { canDeleteRound } from '@/components/swipe-to-delete';
import { supabase } from '@/sync/supabase';
import { ShareCard } from '@/components/share-card';
import { useMe } from '@/lib/me';
import { StatusBanner } from '@/components/status-banner';
import { Body, Button, Card, Chip, H2, Label, Segmented, Stepper, styles } from '@/components/ui';
import { gameKeys, gameName, matchLabel } from '@/lib/games';
import { courseFor, evaluate, grossAt, isResult, recordedMatches, scoreKeys, shortCourseName, teeFor, type ScoreKey } from '@/lib/round';
import { holeWinner, teamGroups, teamHole } from '@/lib/teams';
import { useRound, useStore, type RoundRecord } from '@/store/store';
import { shareRound } from '@/sync/sync';
import { fonts, radius, space, useColors } from '@/theme';

function scoreColor(c: ReturnType<typeof useColors>, diff: number) {
  return diff <= -1 ? c.under : c.text;
}

function ScoreRow({
  r,
  k,
  hole,
  strokes,
  counts,
  teamColor,
}: {
  r: RoundRecord;
  k: ScoreKey;
  hole: number;
  strokes: number;
  counts?: boolean;
  teamColor?: string;
}) {
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
  const { isMe } = useMe();
  const readOnly = r.remote?.role === 'viewer';

  const Wrapper = teamColor ? View : Card;
  return (
    <Wrapper style={teamColor ? { paddingVertical: space.sm, gap: space.sm } : undefined}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* Badges wrap under a long name instead of running into the − / + buttons. */}
          <View style={[styles.row, { flexWrap: 'wrap', rowGap: 4 }]}>
            <H2>{k.label}</H2>
            {!k.isTeam && isMe(k.key) ? <MeBadge small /> : null}
            {counts && teamColor ? (
              <View style={{ backgroundColor: teamColor, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>COUNTS</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ color: c.muted, fontSize: 13 }}>
            {strokes > 0 ? `${'●'.repeat(strokes)} gets ${strokes === 1 ? 'a shot' : `${strokes} shots`}` : strokes < 0 ? 'gives a shot' : ' '}
            {gross !== null && strokes !== 0 ? `  ·  net ${gross - strokes}` : ''}
          </Text>
        </View>
        <View style={styles.row}>
          {!readOnly && <Pressable onPress={() => gross !== null && set(gross - 1)} style={[styles.stepBtn, { backgroundColor: c.chip }]}>
            <Text style={{ color: c.primary, fontSize: 22, fontWeight: '700' }}>−</Text>
          </Pressable>}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${k.label} score`}
            onPress={() => !readOnly && gross === null && set(par)}
            onLongPress={() => !readOnly && setScore(r.id, k.key, hole, null)}
            style={{
              width: 54, height: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
              backgroundColor: gross === null ? c.chip : c.card, borderWidth: gross === null ? 1 : 1.5, borderColor: gross === null ? c.border : scoreColor(c, gross - par),
            }}>
            <Text style={{ fontSize: 26, fontFamily: fonts.serif, fontWeight: '700', color: gross === null ? c.muted : scoreColor(c, gross - par) }}>
              {gross ?? '–'}
            </Text>
          </Pressable>
          {!readOnly && <Pressable onPress={() => set(gross === null ? par : gross + 1)} style={[styles.stepBtn, { backgroundColor: c.chip }]}>
            <Text style={{ color: c.primary, fontSize: 22, fontWeight: '700' }}>+</Text>
          </Pressable>}
        </View>
      </View>

      {r.statsEnabled && !k.isTeam && !readOnly && (
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
    </Wrapper>
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

function TeamBox({ r, results, team, index, hole, keys, gi }: {
  gi: number;
  r: RoundRecord;
  results: ReturnType<typeof evaluate>;
  team: NonNullable<ReturnType<typeof teamGroups>>[number];
  index: number;
  hole: number;
  keys: ScoreKey[];
}) {
  const c = useColors();
  const main = isResult(results[gi]) ? results[gi] : undefined;
  const teams = teamGroups(r, c, gi)!;
  const th = teamHole(r, main, team, hole, gi);
  const winner = holeWinner(teams.map((t) => teamHole(r, main, t, hole, gi)));
  const won = winner === index;
  return (
    <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: won ? 2 : 1, borderColor: won ? team.color : c.border, overflow: 'hidden' }}>
      <View style={{ backgroundColor: team.color, paddingHorizontal: space.lg, paddingVertical: space.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>{team.label.toUpperCase()}</Text>
          <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 17, fontWeight: '700' }}>{team.names}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: '#ffffffcc', fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>{th.label.toUpperCase() || ' '}</Text>
          <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 26, fontWeight: '700' }}>{th.score ?? '–'}</Text>
        </View>
      </View>
      <View style={{ paddingHorizontal: space.lg, backgroundColor: team.soft }}>
        {team.keys.map((key) => {
          const k = keys.find((x) => x.key === key);
          if (!k) return null;
          return (
            <ScoreRow key={key} r={r} k={k} hole={hole} strokes={main?.strokes[key]?.[hole - 1] ?? 0} counts={th.counting.includes(key)} teamColor={team.color} />
          );
        })}
      </View>
      {winner !== null && (
        <View style={{ paddingVertical: 6, alignItems: 'center', backgroundColor: won ? team.color : c.chip }}>
          <Text style={{ color: won ? '#fff' : c.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 }}>
            {winner === 'halved' ? 'HOLE HALVED' : won ? 'WINS THE HOLE' : 'LOSES THE HOLE'}
          </Text>
        </View>
      )}
    </View>
  );
}

/** First hole where someone in this match has no score yet (where a new match should open). */
function firstOpenHole(r: RoundRecord, keys: string[]): number {
  for (let h = 1; h <= 18; h++) if (keys.some((k) => grossAt(r, k, h) === null)) return h;
  return 18;
}

export default function Scorecard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useRound(id);
  const c = useColors();
  const setHole = useStore((s) => s.setHole);
  const completeRound = useStore((s) => s.completeRound);
  const dismissNotices = useStore((s) => s.dismissNotices);
  const names = useStore((s) => s.names);
  const me = useStore((s) => s.me);
  const [view, setView] = useState<'hole' | 'card'>('hole');
  const [focus, setFocus] = useState(0);
  const [quitting, setQuitting] = useState(false);
  const deleteRound = useStore((s) => s.deleteRound);

  if (!r) return <Body>Round not found.</Body>;

  const course = courseFor(r);
  const results = evaluate(r);
  // Several matches in one round: each group focuses on its own match.
  const matchIdx = r.games.map((g, i) => (matchLabel(g) ? i : -1)).filter((i) => i >= 0);
  const multi = matchIdx.length > 1;
  const gi = multi && matchIdx.includes(focus) ? focus : multi ? matchIdx[0] : 0;
  const focusKeys = new Set(gameKeys(r.games[gi]));
  // Each match keeps its own hole, so groups can score at the same time.
  const holeKey = multi ? (r.games[gi].id ?? String(gi)) : undefined;
  const hole = (holeKey && r.matchHoles?.[holeKey]) || (holeKey ? firstOpenHole(r, gameKeys(r.games[gi])) : r.currentHole);
  const goHole = (n: number) => setHole(r.id, n, holeKey);
  const allKeys = scoreKeys(r);
  const keys = multi ? allKeys.filter((k) => focusKeys.has(k.key)) : allKeys;
  const mainStrokes = isResult(results[gi]) ? results[gi].strokes : {};
  const firstTee = teeFor(r, r.players[0].id);
  const h = firstTee.holes[hole - 1];
  const done = (n: number) => keys.every((k) => grossAt(r, k.key, n) !== null);
  const allDone = Array.from({ length: 18 }, (_, i) => allKeys.every((k) => grossAt(r, k.key, i + 1) !== null)).every(Boolean);
  const teams = teamGroups(r, c, gi);
  const inTeams = new Set(teams?.flatMap((t) => t.keys) ?? []);
  const solo = keys.filter((k) => !inTeams.has(k.key));

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
      <StatusBanner
        name={multi ? `${gameName(r.games[gi])} · ${matchLabel(r.games[gi])}` : gameName(r.games[gi])}
        result={results[gi]}
        players={r.players}
        sideColors={teams && teams.length === 2 ? [teams[0].color, teams[1].color] : undefined}
        sideGames={r.games.map((g, i) => ({ g, i })).filter(({ i }) => i !== gi).map(({ g, i }) => ({ name: matchLabel(g) ?? gameName(g), result: results[i] }))}
      />
      {multi && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border }} contentContainerStyle={{ paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm }}>
          {matchIdx.map((i) => {
            const g = r.games[i];
            const sel = i === gi;
            const who = gameKeys(g).map((k) => allKeys.find((x) => x.key === k)?.label.split(' ')[0] ?? '').filter(Boolean);
            const res = results[i];
            return (
              <Pressable
                key={i}
                accessibilityRole="tab"
                accessibilityState={{ selected: sel }}
                onPress={() => setFocus(i)}
                style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: sel ? c.primary : c.border, backgroundColor: sel ? c.primary : c.card }}>
                <Text style={{ color: sel ? c.onPrimary : c.text, fontWeight: '700', fontSize: 13 }}>{matchLabel(g)}</Text>
                <Text numberOfLines={1} style={{ color: sel ? '#ffffffcc' : c.muted, fontSize: 11, maxWidth: 160 }}>
                  {isResult(res) && res.thru ? res.summary : who.join(', ')}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}>
        <Segmented
          options={[{ value: 'hole', label: 'Hole by hole' }, { value: 'card', label: 'Full scorecard' }]}
          value={view}
          onChange={setView}
        />

        {r.remote && r.remote.role !== 'owner' && <IdentityCard scopeKey={r.id} candidates={r.players} />}

        {r.notices.length > 0 && (
          <Card style={{ borderColor: c.accent, borderWidth: 2 }}>
            {r.notices.map((n, i) => (
              <Body key={i}>
                Hole {n.hole}: {keys.find((k) => k.key === n.key)?.label ?? 'A player'}’s score changed from {n.replacedGross} to {n.keptGross}
                {' '}by {n.keptBy === me ? 'you' : (names[n.keptBy] ?? 'another scorekeeper')}
              </Body>
            ))}
            <Button small kind="ghost" title="OK" onPress={() => dismissNotices(r.id)} />
          </Card>
        )}

        {view === 'card' ? (
          <>
            <ScorecardGrid r={r} results={results} focus={gi} onPickHole={(n) => { goHole(n); setView('hole'); }} />
            <Label style={{ textTransform: 'none', letterSpacing: 0 }}>
              ○ birdie  ◎ eagle  □ bogey  ⧈ double+  · gold dot = gets a shot. Tap a score to edit that hole.
            </Label>
            {r.games.map((g, i) => (
              <GameSummaryCard key={i} name={gameName(g)} result={results[i]} players={r.players} />
            ))}
          </>
        ) : (
          <>
            {/* Hole header */}
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Button small kind="secondary" title="‹ Prev" disabled={hole === 1} onPress={() => goHole(hole - 1)} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 32, fontFamily: fonts.serif, fontWeight: '700', color: c.primary }}>Hole {hole}</Text>
                <Text style={{ color: c.muted, fontWeight: '600', letterSpacing: 0.5 }}>Par {h.par} · Hcp {h.strokeIndex} · {h.yards} yds</Text>
              </View>
              <Button small kind="secondary" title="Next ›" disabled={hole === 18} onPress={() => goHole(hole + 1)} />
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
                <Pressable key={n} onPress={() => goHole(n)} hitSlop={3}>
                  <View
                    style={{
                      width: 13, height: 13, borderRadius: 7,
                      backgroundColor: n === hole ? c.accent : done(n) ? c.primary : c.card,
                      borderWidth: 1, borderColor: n === hole ? c.accent : done(n) ? c.primary : c.border,
                    }}
                  />
                </Pressable>
              ))}
            </View>
            <Label style={{ textTransform: 'none', textAlign: 'center', letterSpacing: 0 }}>Tap a box to enter par, then − / +. Hold to clear.</Label>

            {r.games.map((g, i) => {
              const res = results[i];
              if (r.remote?.role === 'viewer') return null;
              if (g.type === 'wolf' && res && isResult(res) && res.type === 'wolf') return <WolfPanel key={i} r={r} index={i} result={res} hole={hole} />;
              return null;
            })}

            {teams?.map((t, i) => <TeamBox key={t.id} r={r} results={results} team={t} index={i} hole={hole} keys={keys} gi={gi} />)}

            {solo.map((k) => (
              <ScoreRow key={k.key} r={r} k={k} hole={hole} strokes={mainStrokes[k.key]?.[hole - 1] ?? 0} />
            ))}

            {hole < 18 && done(hole) && <Button title={`Next hole: ${hole + 1} ›`} onPress={() => goHole(hole + 1)} />}

            {r.games.map((g, i) => (g.type === 'nassau' && r.remote?.role !== 'viewer' && (!multi || i === gi) ? <NassauPress key={i} r={r} index={i} hole={hole} /> : null))}
          </>
        )}

        <ShareCard remote={r.remote} what="round" onShare={() => shareRound(r.id)} />
        {r.remote?.role !== 'viewer' && <Button title="Finish round" kind={allDone ? 'primary' : 'secondary'} onPress={finish} />}
        {r.remote?.role !== 'viewer' && canDeleteRound(r) && (
          <Button title={r.remote && r.remote.role !== 'owner' ? 'Leave round' : 'Quit round'} kind="ghost" onPress={() => setQuitting(true)} />
        )}
        <ConfirmDialog
          visible={quitting}
          title={r.remote && r.remote.role !== 'owner' ? 'Leave this round?' : 'Quit this round?'}
          message={
            r.remote && r.remote.role !== 'owner'
              ? 'It will be removed from your phone. The rest of the group can keep playing.'
              : `The round and the scores entered so far will be deleted${r.remote ? ' for everyone in the group' : ''}. This can’t be undone.`
          }
          cancelLabel="Keep playing"
          confirmLabel={r.remote && r.remote.role !== 'owner' ? 'Leave round' : 'Quit round'}
          onCancel={() => setQuitting(false)}
          onConfirm={() => {
            setQuitting(false);
            if (r.remote?.role === 'owner') void supabase.from('rounds').delete().eq('id', r.id);
            router.dismissTo('/');
            deleteRound(r.id);
          }}
        />
      </ScrollView>
    </>
  );
}
