import { greenInRegulation, type FairwayResult, type NassauConfig, type WolfConfig, type WolfResult } from '@golf/engine';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useState } from 'react';

import { GameSummaryList } from '@/components/game-summary';
import { ScorecardGrid } from '@/components/scorecard-grid';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { MeBadge, useAutoIdentity } from '@/components/people';
import { canDeleteRound } from '@/components/swipe-to-delete';
import { HideButton, OrganizerLine } from '@/components/organizer';
import { supabase } from '@/sync/supabase';
import { ShareCard } from '@/components/share-card';
import { useMe } from '@/lib/me';
import { StatusBanner } from '@/components/status-banner';
import { Body, Button, Card, Chip, H2, Label, Segmented, Stepper, styles } from '@/components/ui';
import { gameKeys, gameName, matchLabel, gameTitle } from '@/lib/games';
import { courseFor, evaluate, grossAt, isResult, recordedMatches, scoreKeys, shortCourseName, teeFor, type ScoreKey, allHolesScored, gameHoles } from '@/lib/round';
import { holeWinner, teamGroups, teamHole } from '@/lib/teams';
import { useRound, useStore, type RoundRecord, isRoundOrganizer } from '@/store/store';
import { flush, shareRound } from '@/sync/sync';
import { fonts, radius, space, teamColor, useColors } from '@/theme';
import { track } from '@/lib/usage';
import { Tip } from '@/components/tip';
import { TeamScoreboard } from '@/components/team-scoreboard';
import { cardSides, liveTeamScore } from '@/lib/results';
import { headline } from '@/lib/headline';
import { AddToEvent } from '@/components/add-to-event';
import { namesFor, renameTeams, teamName, TeamColors, roundPicks } from '@/lib/team-colors';
import { myMatchIndex } from '@/components/live-carousel';
import { EditRights, canEditGame, canEditKey, useAccountId, useCanEdit, useEditRequests } from '@/lib/edit-rights';
import { EditRequestsCard, LockedMatch } from '@/components/edit-lock';

export { ErrorBoundary } from '@/components/error-screen';

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
  // Followers, and anyone not allowed to score this player's match, just see the score.
  const allowed = useCanEdit(k.key);
  const readOnly = r.remote?.role === 'viewer' || !allowed;

  const Wrapper = teamColor ? View : Card;
  return (
    <Wrapper style={teamColor ? { paddingVertical: 4, gap: 3 } : { paddingVertical: 10, paddingHorizontal: 14, gap: 6 }}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* Badges wrap under a long name instead of running into the − / + buttons. */}
          <View style={[styles.row, { flexWrap: 'wrap', rowGap: 4 }]}>
            <Text style={{ fontFamily: fonts.serif, fontSize: 17, fontWeight: '700', color: c.text }}>{k.label}</Text>
            {!k.isTeam && isMe(k.key) ? <MeBadge small /> : null}
            {counts && teamColor ? (
              <View style={{ backgroundColor: teamColor, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>COUNTS</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ color: c.muted, fontSize: 12 }}>
            {strokes > 0 ? `${'●'.repeat(strokes)} gets ${strokes === 1 ? 'a shot' : `${strokes} shots`}` : strokes < 0 ? 'gives a shot' : ' '}
            {gross !== null && strokes !== 0 ? `  ·  net ${gross - strokes}` : ''}
          </Text>
        </View>
        <View style={styles.row}>
          {!readOnly && <Pressable onPress={() => set(gross === null ? par : gross - 1)} style={[styles.stepBtn, { width: 36, height: 36, borderRadius: 18, backgroundColor: c.chip }]}>
            <Text style={{ color: c.primary, fontSize: 22, fontWeight: '700' }}>−</Text>
          </Pressable>}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${k.label} score`}
            onPress={() => !readOnly && gross === null && set(par)}
            onLongPress={() => !readOnly && setScore(r.id, k.key, hole, null)}
            style={{
              width: teamColor ? 42 : 46, height: teamColor ? 42 : 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
              backgroundColor: gross === null ? c.chip : c.card, borderWidth: gross === null ? 1 : 1.5, borderColor: gross === null ? c.border : scoreColor(c, gross - par),
            }}>
            <Text style={{ fontSize: 22, fontFamily: fonts.serif, fontWeight: '700', color: gross === null ? c.muted : scoreColor(c, gross - par) }}>
              {gross ?? '–'}
            </Text>
          </Pressable>
          {!readOnly && <Pressable onPress={() => set(gross === null ? par : gross + 1)} style={[styles.stepBtn, { width: 36, height: 36, borderRadius: 18, backgroundColor: c.chip }]}>
            <Text style={{ color: c.primary, fontSize: 22, fontWeight: '700' }}>+</Text>
          </Pressable>}
        </View>
      </View>

      {r.statsEnabled && !k.isTeam && !readOnly && (
        // Putts and fairway on one compact line.
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 4 }}>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 }}>PUTTS</Text>
          <Stepper
            small
            value={stats?.putts ?? -1}
            min={-1}
            max={6}
            format={(v) => (v < 0 ? '–' : String(v))}
            onChange={(v) => setStat({ putts: stats?.putts == null ? (v < 0 ? 1 : 2) : Math.max(0, v) })}
          />
          {par >= 4 && (
            <>
              <Text style={{ color: c.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginLeft: 4 }}>FWY</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {fairways.map(([v, label]) => {
                  const sel = stats?.fairway === v;
                  return (
                    <Pressable key={v} onPress={() => setStat({ fairway: v })} accessibilityRole="button" accessibilityState={{ selected: sel }} accessibilityLabel={`Fairway ${v}`}
                      style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, borderWidth: 1, borderColor: sel ? c.primary : c.border, backgroundColor: sel ? c.primary : c.card }}>
                      <Text style={{ color: sel ? c.onPrimary : c.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
          {gross !== null && stats?.putts != null && (
            <Text style={{ color: greenInRegulation(gross, stats.putts, par) ? c.primary : c.muted, fontSize: 11, fontWeight: '700' }}>
              GIR {greenInRegulation(gross, stats.putts, par) ? '✓' : '✗'}
            </Text>
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
  const entry = result.holes.find((x) => x.hole === hole);
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
  // Front/back = the first and second nine played (a match can start on hole 10 or any hole).
  const order = gameHoles(game);
  const segment = order.indexOf(hole) < 9 ? 'front' : 'back';
  const nineName = order[0] === 1 ? segment : segment === 'front' ? 'first' : 'second';
  const presses = game.presses ?? [];
  const add = (seg: 'front' | 'back' | 'overall') => {
    updateGame(r.id, index, { ...game, presses: [...presses, { segment: seg, startHole: hole }] });
    track('press_added');
  };
  return (
    <Card>
      <H2>Nassau presses</H2>
      {presses.length > 0 ? (
        <Body muted>{presses.map((p) => `${p.segment} from ${p.startHole}`).join(' · ')}</Body>
      ) : (
        <Body muted>A press starts a new bet from this hole to the end of the nine.</Body>
      )}
      <View style={styles.row}>
        <Button small kind="secondary" title={`Press ${nineName} 9 from #${hole}`} onPress={() => add(segment)} />
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
      {/* One slim line: the team, what counts, and the team's score on this hole (players are listed below). */}
      <View style={{ backgroundColor: team.color, paddingHorizontal: space.md, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 }}>{team.label.toUpperCase()}</Text>
        <Text numberOfLines={1} style={{ flex: 1, color: '#ffffffcc', fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>{th.label.toUpperCase()}</Text>
        <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 20, fontWeight: '700' }}>{th.score ?? '–'}</Text>
      </View>
      <View style={{ paddingHorizontal: space.md, backgroundColor: team.soft }}>
        {team.keys.map((key) => {
          const k = keys.find((x) => x.key === key);
          if (!k) return null;
          return (
            <ScoreRow key={key} r={r} k={k} hole={hole} strokes={main?.strokes[key]?.[hole - 1] ?? 0} counts={th.counting.includes(key)} teamColor={team.color} />
          );
        })}
      </View>
      {winner !== null && (
        <View style={{ paddingVertical: 3, alignItems: 'center', backgroundColor: won ? team.color : c.chip }}>
          <Text style={{ color: won ? '#fff' : c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>
            {winner === 'halved' ? 'HOLE HALVED' : won ? 'WINS THE HOLE' : 'LOSES THE HOLE'}
          </Text>
        </View>
      )}
    </View>
  );
}

/** For a singles match (or singles Nassau): which side this player is on. */
function singlesSide(r: RoundRecord, gi: number, key: string): 'A' | 'B' | null {
  const g = r.games[gi];
  if (!g || (g.type !== 'matchPlay' && g.type !== 'nassau') || g.format !== 'singles') return null;
  return g.sideA.members.includes(key) ? 'A' : g.sideB.members.includes(key) ? 'B' : null;
}

/** One player in a singles match: their team colour, and who won the hole. */
function SinglesBox({ r, k, hole, gi, side, result, strokes }: { r: RoundRecord; k: ScoreKey; hole: number; gi: number; side: 'A' | 'B'; result: ReturnType<typeof evaluate>[number] | undefined; strokes: number }) {
  const c = useColors();
  const g = r.games[gi] as NassauConfig | Extract<RoundRecord['games'][number], { type: 'matchPlay' }>;
  const letter = r.teamOf?.[k.key] ?? (/-([A-Z])$/.exec(side === 'A' ? g.sideA.id : g.sideB.id)?.[1]) ?? side;
  const color = teamColor(letter, roundPicks(r)).color;
  const soft = teamColor(letter, roundPicks(r)).soft;
  const outcomes = result && isResult(result) ? (result.type === 'matchPlay' ? result.status.outcomes : result.type === 'nassau' ? result.segments[2].status.outcomes : []) : [];
  const o = outcomes[hole - 1] ?? null;
  const won = o !== null && o === (side === 'A' ? 1 : -1);
  return (
    <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: won ? 2 : 1, borderColor: won ? color : c.border, borderLeftWidth: 5, borderLeftColor: color, overflow: 'hidden' }}>
      <View style={{ paddingHorizontal: space.lg, backgroundColor: won ? soft : c.card }}>
        <ScoreRow r={r} k={k} hole={hole} strokes={strokes} teamColor={color} />
      </View>
      {o !== null && (
        <View style={{ paddingVertical: 3, alignItems: 'center', backgroundColor: won ? color : c.chip }}>
          <Text style={{ color: won ? '#fff' : c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>
            {o === 0 ? 'HOLE HALVED' : won ? 'WINS THE HOLE' : 'LOSES THE HOLE'}
          </Text>
        </View>
      )}
    </View>
  );
}

/** First hole (in playing order) where someone in this match has no score yet: where a match opens. */
function firstOpenHole(r: RoundRecord, keys: string[], order: number[]): number {
  for (const h of order) if (keys.some((k) => grossAt(r, k, h) === null)) return h;
  return order[order.length - 1] ?? 18;
}

export default function Scorecard() {
  const { id, view: startView, match: startMatch } = useLocalSearchParams<{ id: string; view?: string; match?: string }>();
  const r = useRound(id);
  const c = useColors();
  const setHole = useStore((s) => s.setHole);
  const completeRound = useStore((s) => s.completeRound);
  const dismissNotices = useStore((s) => s.dismissNotices);
  const names = useStore((s) => s.names);
  const me = useStore((s) => s.me);
  // "Edit scores" on an uploaded round opens the full scorecard, where any hole can be changed.
  const [view, setView] = useState<'hole' | 'card'>(startView === 'card' ? 'card' : 'hole');
  const insets = useSafeAreaInsets();
  // Joined to follow the leaderboard: full scorecard only, never editable.
  // Opened from a match card on Home: start on that match.
  // Otherwise: the match I'm playing in.
  const { isMe: isMeId } = useMe();
  const [focus, setFocus] = useState(() => (startMatch !== undefined && startMatch !== '' ? Number(startMatch) || 0 : r ? myMatchIndex(r, isMeId) : 0));
  // The hole each match opened on, until someone moves it (so entering the last score doesn't jump ahead).
  const [opened, setOpened] = useState<Record<string, number>>({});
  const [quitting, setQuitting] = useState(false);
  const deleteRound = useStore((s) => s.deleteRound);
  const allEvents = useStore((s) => s.events);
  const myUid = useStore((s) => s.me);

  useAutoIdentity(r && r.remote && r.remote.role !== 'owner' ? r.players : []);
  const uid = useAccountId();
  const { requests, claimed, reload } = useEditRequests(r);
  const { isMe: isMyId } = useMe();
  if (!r) return <Body>Round not found.</Body>;
  const organizer = isRoundOrganizer(r, allEvents, myUid);
  const viewer = r.remote?.role === 'viewer';

  const course = courseFor(r);
  const results = evaluate(r);
  // Several matches in one round: each group focuses on its own match.
  const matchIdx = r.games.map((g, i) => (matchLabel(g) ? i : -1)).filter((i) => i >= 0);
  const multi = matchIdx.length > 1;
  const gi = multi && matchIdx.includes(focus) ? focus : multi ? matchIdx[0] : 0;
  const focusKeys = new Set(gameKeys(r.games[gi]));
  // Each match keeps its own hole, so groups can score at the same time.
  const holeKey = multi ? (r.games[gi].id ?? String(gi)) : undefined;
  // The holes this match plays, in order (9 or 18, from its starting hole).
  const order = gameHoles(r.games[gi]);
  if (holeKey && !r.matchHoles?.[holeKey] && opened[holeKey] === undefined) setOpened({ ...opened, [holeKey]: firstOpenHole(r, gameKeys(r.games[gi]), order) });
  const rawHole = (holeKey && (r.matchHoles?.[holeKey] || opened[holeKey] || firstOpenHole(r, gameKeys(r.games[gi]), order))) || r.currentHole;
  // Older rounds (or a hole outside this match) fall back to the match's first hole.
  const hole = order.includes(rawHole) ? rawHole : order[0];
  const pos = order.indexOf(hole);
  const prevHole = pos > 0 ? order[pos - 1] : null;
  const nextHole = pos >= 0 && pos < order.length - 1 ? order[pos + 1] : null;
  const goHole = (n: number) => setHole(r.id, n, holeKey);
  const allKeys = scoreKeys(r);
  const keys = multi ? allKeys.filter((k) => focusKeys.has(k.key)) : allKeys;
  const mainStrokes = isResult(results[gi]) ? results[gi].strokes : {};
  const firstTee = teeFor(r, r.players[0].id);
  const h = firstTee.holes[hole - 1];
  const done = (n: number) => keys.every((k) => grossAt(r, k.key, n) !== null);
  const allDone = allHolesScored(r);
  const tnames = namesFor(r, useStore.getState().events.find((e) => e.id === r.eventId));
  const sidesByGame = cardSides(r, results, (L) => teamName(L, tnames), (L) => teamColor(L, roundPicks(r)).color);
  const teams = teamGroups(r, c, gi);
  const inTeams = new Set(teams?.flatMap((t) => t.keys) ?? []);
  const solo = keys.filter((k) => !inTeams.has(k.key));
  // Only players in a match (or anyone, for an all-guest match, or someone they said yes to) can enter its scores.
  const rights = { uid, isMe: isMyId, requests, claimed };
  const canEdit = (key: string) => !viewer && canEditKey(r, key, rights);
  const locked = !viewer && !!uid && !canEditGame(r, gi, rights);

  const finish = () => {
    const go = () => {
      completeRound(r.id, recordedMatches(r, results.filter(isResult)));
      track('round_completed', { games: r.games.map((g) => g.type).join(','), players: r.players.length, in_event: !!r.eventId });
      router.replace(`/round/${r.id}/results`);
    };
    if (allDone) return go();
    Alert.alert('Finish round?', 'Some holes have no score. Games will be scored on the holes played.', [
      { text: 'Keep scoring' },
      { text: 'Finish', onPress: go },
    ]);
  };

  // others: list the other matches under this one (left out in the full scorecard, where their cards are below).
  const matchBanner = (others = true) => (
    <StatusBanner
      name={multi ? `${gameName(r.games[gi])} · ${matchLabel(r.games[gi])}` : gameName(r.games[gi])}
      result={results[gi]}
      players={r.players}
      sideColors={teams && teams.length === 2 ? [teams[0].color, teams[1].color] : undefined}
      sideGames={others ? r.games.map((g, i) => ({ g, i })).filter(({ i }) => i !== gi).map(({ g, i }) => ({ name: matchLabel(g) ?? gameName(g), result: results[i] })) : []}
    />
  );
  // Team rounds: the team score is pinned on top in both views (hole by hole and full scorecard).
  const teamTop = !!liveTeamScore(r, results);
  // The match being scored, front and centre: a bold bar in the leading side's colour.
  const curRes = results[gi];
  const head = curRes && isResult(curRes) ? headline(curRes, r.players) : null;
  const gameSides = ((): [string[], string[]] | null => {
    const g = r.games[gi];
    if (g.type === 'matchPlay' || g.type === 'nassau') return [g.sideA.members, g.sideB.members];
    if (g.type === 'vegas') return [g.teamA.members, g.teamB.members];
    if ((g.type === 'scramble' || g.type === 'shamble') && g.teams.length === 2) return [g.teams[0].members, g.teams[1].members];
    return null;
  })();
  // The leading side's team colour (from the Teams step), else the usual side colours.
  const sideColor = (sd: 0 | 1 | null) => {
    if (sd === null) return c.brand;
    const L = gameSides ? r.teamOf?.[gameSides[sd][0]] : undefined;
    if (L) return teamColor(L, roundPicks(r)).color;
    return sd === 0 ? (teams?.[0]?.color ?? teamColor('A', roundPicks(r)).color) : (teams?.[1]?.color ?? teamColor('B', roundPicks(r)).color);
  };
  // Leader in first names ("Ben & Dan"), and the score kept separate so it's never cut off.
  const short = (n: string) => n.split(' & ').map((x) => x.split(' ')[0]).join(' & ');
  const statusWho = renameTeams(!head ? '' : head.board ? (head.board[0]?.name ?? '') : head.leader ? short(head.leader) : '', tnames);
  const statusBig = !head ? '' : head.board ? (head.board[0]?.value ?? head.big) : statusWho ? head.big.replace(/^Win\b/, statusWho.includes('&') ? 'win' : 'wins') : head.big;
  const matchStatusBar = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: sideColor(head?.side ?? null), borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: '#ffffffcc', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }}>
          {(matchLabel(r.games[gi]) ?? gameName(r.games[gi])).toUpperCase()}{head?.small ? ` · ${head.small.toUpperCase()}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          {statusWho ? <Text numberOfLines={1} style={{ flexShrink: 1, color: '#fff', fontFamily: fonts.serif, fontSize: 20, fontWeight: '700' }}>{statusWho}</Text> : null}
          <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 21, fontWeight: '700' }}>{statusBig}</Text>
        </View>
      </View>
      <Pressable onPress={() => setView('card')} accessibilityRole="button" accessibilityLabel="Show the full scorecard" hitSlop={6}
        style={({ pressed }) => ({ backgroundColor: '#ffffff2e', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Scorecard ▦</Text>
      </Pressable>
    </View>
  );
  const currentMatchCard = teamTop ? (
    <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>{matchBanner(false)}</View>
  ) : null;
  const matchCards = (
    <GameSummaryList items={r.games.map((g, i) => ({ key: i, name: gameTitle(g, r.players), result: results[i], sides: sidesByGame[i] }))} players={r.players} collapsed />
  );

  return (
    <TeamColors picks={roundPicks(r)} names={tnames}>
      <Stack.Screen options={{ title: shortCourseName(course.name) }} />
      {/* Full scorecard of a team round: the team score is pinned on top, the match status sits in the page. */}
      {teamTop ? <TeamScoreboard r={r} results={results} pinned={view === 'card' || viewer} mini={view === 'hole' && !viewer} /> : matchBanner()}
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
      <EditRights.Provider value={canEdit}>
      <ScrollView contentContainerStyle={{ padding: view === 'hole' && !viewer ? space.md : space.lg, gap: view === 'hole' && !viewer ? 8 : space.md, paddingBottom: 60 }}>
        {viewer ? (
          // Following along: the full scorecard only, nothing editable.
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.primarySoft, borderRadius: radius.md, paddingVertical: space.sm, paddingHorizontal: space.md }}>
            <Text style={{ fontSize: 16 }}>👀</Text>
            <Text style={{ flex: 1, color: c.text, fontSize: 14 }}>
              <Text style={{ fontWeight: '700' }}>Following live.</Text> Scores update as the group plays. View only.
            </Text>
          </View>
        ) : (
          teamTop && view === 'hole' ? (
            matchStatusBar
          ) : (
          <Segmented
            compact={view === 'hole'}
            options={[{ value: 'hole', label: 'Hole by hole' }, { value: 'card', label: 'Full scorecard' }]}
            value={view}
            onChange={setView}
          />
          )
        )}


        {!viewer && uid ? <EditRequestsCard r={r} rights={rights} reload={reload} /> : null}

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

        {view === 'card' || viewer ? (
          <>
            {currentMatchCard}
            <ScorecardGrid r={r} results={results} focus={gi} onPickHole={viewer ? undefined : (n) => { goHole(n); setView('hole'); }} />
            <Label style={{ textTransform: 'none', letterSpacing: 0 }}>
              ○ birdie  ◎ eagle  □ bogey  ⧈ double+  · gold dot = gets a shot.{viewer ? '' : ' Tap a score to edit that hole.'}
            </Label>
            {matchCards}
          </>
        ) : (
          <>
            {locked && uid ? <LockedMatch r={r} gi={gi} uid={uid} requests={requests} reload={reload} /> : null}

            {/* Hole header (the match buttons above already show each match's status) */}
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Button small kind="secondary" title="‹ Prev" disabled={prevHole === null} onPress={() => prevHole && goHole(prevHole)} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 24, fontFamily: fonts.serif, fontWeight: '700', color: c.primary, lineHeight: 27 }}>Hole {hole}</Text>
                <Text style={{ color: c.muted, fontWeight: '600', letterSpacing: 0.5, fontSize: 13 }}>Par {h.par} · Hcp {h.strokeIndex} · {h.yards} yds</Text>
              </View>
              <Button small kind="secondary" title="Next ›" disabled={nextHole === null} onPress={() => nextHole && goHole(nextHole)} />
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {order.map((n) => (
                <Pressable key={n} onPress={() => goHole(n)} hitSlop={3}>
                  <View
                    style={{
                      width: 11, height: 11, borderRadius: 6,
                      backgroundColor: n === hole ? c.accent : done(n) ? c.primary : c.card,
                      borderWidth: 1, borderColor: n === hole ? c.accent : done(n) ? c.primary : c.border,
                    }}
                  />
                </Pressable>
              ))}
            </View>

            {r.games.map((g, i) => {
              const res = results[i];
              if (r.remote?.role === 'viewer' || !canEditGame(r, i, rights)) return null;
              if (g.type === 'wolf' && res && isResult(res) && res.type === 'wolf') return <WolfPanel key={i} r={r} index={i} result={res} hole={hole} />;
              return null;
            })}

            {teams?.map((t, i) => <TeamBox key={t.id} r={r} results={results} team={t} index={i} hole={hole} keys={keys} gi={gi} />)}

            {solo.map((k) => {
              const side = singlesSide(r, gi, k.key);
              if (!side) return <ScoreRow key={k.key} r={r} k={k} hole={hole} strokes={mainStrokes[k.key]?.[hole - 1] ?? 0} />;
              return <SinglesBox key={k.key} r={r} k={k} hole={hole} gi={gi} side={side} result={results[gi]} strokes={mainStrokes[k.key]?.[hole - 1] ?? 0} />;
            })}


            {r.games.map((g, i) => (g.type === 'nassau' && r.remote?.role !== 'viewer' && canEditGame(r, i, rights) && (!multi || i === gi) ? <NassauPress key={i} r={r} index={i} hole={hole} /> : null))}

            {/* Team rounds: every match's card (with its teams) below the hole, as on the full scorecard. */}
            {teamTop && matchCards}
          </>
        )}

        <ShareCard remote={r.remote} what="round" onShare={() => shareRound(r.id)} />
        <AddToEvent r={r} />
        {/* Wrong person put in (it was Mitch, not Dave): swap them, keeping the scores. */}
        {r.remote?.role !== 'viewer' && <Button title="Change a player" kind="secondary" onPress={() => router.push(`/round/${r.id}/players`)} />}
        {/* Move players between teams mid-round (team scores follow). */}
        {r.remote?.role !== 'viewer' && r.teamOf && Object.keys(r.teamOf).length > 0 && (
          <Button title="Edit teams" kind="secondary" onPress={() => router.push(`/round/${r.id}/teams`)} />
        )}
        {r.remote?.role !== 'viewer' && <Button title="Finish round" kind={allDone ? 'primary' : 'secondary'} onPress={finish} />}
        <OrganizerLine r={r} />
        {/* Only the organiser can delete the round; anyone else can hide it from their own screens. */}
        {organizer && canDeleteRound(r) ? (
          <Button title="Quit round" kind="ghost" onPress={() => setQuitting(true)} />
        ) : (
          <HideButton id={r.id} kind="round" onDone={() => router.dismissTo('/')} />
        )}
        <ConfirmDialog
          visible={quitting}
          title="Quit this round?"
          message={`The round and the scores entered so far will be deleted${r.remote ? ' for everyone in the group' : ''}. You can restore it from Recently Deleted for 30 days.`}
          cancelLabel="Keep playing"
          confirmLabel="Quit round"
          onCancel={() => setQuitting(false)}
          onConfirm={() => {
            setQuitting(false);
            router.dismissTo('/');
            // Deleted online by the sync straight away (or left, if someone else started it).
            deleteRound(r.id, { now: true });
            track('round_deleted');
            void flush();
          }}
        />
      </ScrollView>
      </EditRights.Provider>
      {/* Always on screen while scoring, so there's no scrolling between entering scores and moving on. */}
      {view === 'hole' && !viewer && (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + space.sm, backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.border }}>
          {nextHole !== null ? (
            <Button
              title={done(hole) || locked ? `Next hole: ${nextHole} ›` : `Enter every score for hole ${hole}`}
              kind={done(hole) ? 'primary' : 'secondary'}
              disabled={!done(hole) && !locked}
              onPress={() => goHole(nextHole)}
            />
          ) : (
            <Button title="Finish round ›" kind={allDone ? 'primary' : 'secondary'} onPress={finish} />
          )}
        </View>
      )}
      <Tip
        id="scoring"
        when={r.remote?.role !== 'viewer'}
        title="Entering scores"
        lines={[
          'Tap a player’s box to enter par, then use − and + to adjust.',
          'Press and hold a box to clear it.',
          'Tap the dots under the hole number to jump to any hole.',
          ...(multi ? ['Tap the matches along the top to switch between them. Every match updates as you score.'] : []),
        ]}
      />
    </TeamColors>
  );
}
