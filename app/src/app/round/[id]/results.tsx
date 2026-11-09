import { summarizeStats, type GameResult } from '@golf/engine';
import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { Confetti } from '@/components/confetti';
import { GameSummaryList } from '@/components/game-summary';
import { LogoMark } from '@/components/logo';
import { MatchStory, SideRow } from '@/components/match-result';
import { MeBadge } from '@/components/people';
import { Mark } from '@/components/scorecard-grid';
import { Body, Button, Card, H2, Label, Segmented } from '@/components/ui';
import { toPar } from '@/lib/format';
import { eventTeamTotals } from '@/lib/events';
import { gameName, matchLabel, teamIdName, gameTitle } from '@/lib/games';
import { useMe } from '@/lib/me';
import { matchOutcomes, teamTotals, type MatchOutcome, cardSides } from '@/lib/results';
import { storyHoles } from '@/lib/story';
import { teamGroups, teamHole } from '@/lib/teams';
import { courseFor, evaluate, grossAt, isResult, postingList, scoreKeys, shortCourseName, teeFor, roundHoleCount } from '@/lib/round';
import { useRound, useStore } from '@/store/store';
import { fonts, radius, space, teamColor, useColors } from '@/theme';
import { namesFor, teamName, TeamColors } from '@/lib/team-colors';
import { track } from '@/lib/usage';
import { Tip } from '@/components/tip';
import { AddToEvent } from '@/components/add-to-event';

const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];

/** 1.5 → "1½", 0.5 → "½". */
const pts = (n: number) => (n % 1 ? `${Math.floor(n) || ''}½` : String(n));

export default function Results() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useRound(id);
  const reopen = useStore((s) => s.reopenRound);
  const events = useStore((s) => s.events);
  const allRounds = useStore((s) => s.rounds);
  const { isMe } = useMe();
  const c = useColors();
  const shot = useRef<ComponentRef<typeof View>>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [scoreView, setScoreView] = useState<'players' | 'teams'>('players');
  if (!r) return <Body>Round not found.</Body>;

  const results = evaluate(r);
  const picks = r.teamColors;
  const names = namesFor(r, useStore.getState().events.find((ev) => ev.id === r.eventId));
  const tn = (L: string) => teamName(L, names);
  const evTeams = useStore.getState().events.find((ev) => ev.id === r.eventId)?.teams;
  const resultSides = cardSides(r, results, (L) => tn(L), (L) => teamColor(L, picks).color);
  const event = events.find((e) => e.id === r.eventId);
  const overall = event?.teamOf || event?.teams ? eventTeamTotals(event!.teamOf ? event! : { ...event!, teamLetters: ['A', 'B'] }, allRounds).totals : null;
  const posting = postingList(r);
  const name = (pid: string) => r.players.find((p) => p.id === pid)?.name ?? pid;
  let courseName = 'Golf';
  try { courseName = shortCourseName(courseFor(r).name); } catch { /* course missing */ }
  const date = new Date(r.fromPhoto ? r.createdAt : (r.completedAt ?? r.createdAt)).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  const matches = matchOutcomes(r, results);
  const teams = teamTotals(r, matches);
  const teamRound = teams.length >= 2 && matches.some((m) => m.a.letter !== m.b.letter);
  const decided = teamRound && matches.some((m) => m.winner);
  const teamWinner = decided && teams[0].points > teams[1].points ? teams[0].letter : null;
  const teamTie = decided && !teamWinner;

  // Me: my team and my matches.
  const myIds = r.players.filter((p) => isMe(p.id)).map((p) => p.id);
  const myTeam = myIds.map((m) => r.teamOf?.[m]).find(Boolean) ?? teams.find((t) => t.members.some((m) => myIds.includes(m)))?.letter;
  const mySide = (m: MatchOutcome): 'a' | 'b' | null => (m.a.members.some((x) => myIds.includes(x)) ? 'a' : m.b.members.some((x) => myIds.includes(x)) ? 'b' : null);
  const myWins = matches.filter((m) => m.winner && m.winner === mySide(m));
  const others = r.games.map((g, i) => ({ g, i })).filter(({ i }) => !matches.some((m) => m.gi === i));
  // Other games I (or my team) won: stroke play, stableford, scramble…
  const wonOther = others.some(({ i }) => {
    const res = results[i];
    if (!res || !isResult(res) || !res.finished) return false;
    return res.winnerIds.some((w) => myIds.includes(w) || (!!myTeam && teamIdName(w) === `Team ${myTeam}`));
  });

  let celebrate = false;
  let headline = 'Final results';
  let sub = '';
  if (teamWinner) {
    headline = `${tn(teamWinner)} win${tn(teamWinner).startsWith('Team ') ? 's' : ''}!`;
    celebrate = !!myTeam && myTeam === teamWinner;
    sub = celebrate ? 'Your team took it. Drinks are on the losers.' : myTeam ? `${tn(myTeam)} will get them next time.` : '';
  } else if (teamTie) {
    headline = 'All square';
    celebrate = myWins.length > 0;
    sub = myWins.length ? `The teams finished level, but you won your match ${myWins[0].detail}.` : 'The teams finished level.';
  } else if (myWins.length || wonOther) {
    celebrate = true;
    headline = 'You won!';
    sub = myWins.length > 1 ? `You won ${myWins.length} matches.` : 'Nicely played.';
  }

  type Row = { k: { key: string; label: string; isTeam: boolean }; tee: ReturnType<typeof teeFor>; g: (h: number) => number | null; out: number | null; inn: number | null; tot: number; holes: number; toPar: number; letter?: string; sub?: string };
  const makeRow = (k: Row['k'], g: Row['g'], tee: Row['tee'], letter?: string, sub?: string): Row => {
    const sum = (holes: number[]) => holes.reduce((s, h) => s + (g(h) ?? 0), 0);
    const played = [...FRONT, ...BACK].filter((h) => g(h) !== null);
    const par = played.reduce((s, h) => s + tee.holes[h - 1].par, 0);
    return {
      k, tee, g, letter, sub,
      out: FRONT.some((h) => g(h) !== null) ? sum(FRONT) : null,
      inn: BACK.some((h) => g(h) !== null) ? sum(BACK) : null,
      tot: sum(played),
      holes: played.length,
      toPar: sum(played) - par,
    };
  };
  const rows = scoreKeys(r)
    .map((k) => makeRow(k, (h) => grossAt(r, k.key, h), teeFor(r, k.members[0]), r.teamOf?.[k.members[0]]))
    .filter((x) => x.holes > 0)
    .sort((a, b) => (a.holes === b.holes ? a.tot - b.tot : b.holes - a.holes));

  // Team cards: the score that counted for each team in each team match (best ball, alternate shot, scramble…).
  const teamRows: Row[] = [];
  let teamNet = false;
  r.games.forEach((g, gi) => {
    const res = results[gi];
    if (g.type === 'vegas' || !res || !isResult(res)) return;
    const groups = teamGroups(r, c, gi);
    if (!groups) return;
    if (g.handicap?.net !== false) teamNet = true;
    const label = matchLabel(g);
    for (const t of groups) {
      const firsts = t.names.split(' & ').map((n) => n.split(' ')[0]).join(' & ');
      const row = makeRow({ key: `${gi}:${t.id}`, label: firsts, isTeam: true }, (h) => teamHole(r, res, t, h, gi).score, teeFor(r, r.players[0].id), t.label.slice(-1), label ?? undefined);
      if (row.holes > 0) teamRows.push(row);
    }
  });

  const shareText = () => {
    const lines = [`⛳ ${celebrate && !teamWinner ? 'I won!' : headline} ${courseName} · ${date}`];
    if (teamRound) lines.push(teams.map((t) => `${tn(t.letter)} ${pts(t.points)}`).join(' – '));
    for (const m of matches) {
      const w = m.winner === 'a' ? m.a.names : m.winner === 'b' ? m.b.names : null;
      lines.push(`${m.title}: ${m.a.names} v ${m.b.names}: ${w ? `${w} ${m.detail}` : m.detail}`);
    }
    if (rows.length) lines.push(rows.map((x) => `${x.k.label} ${x.tot}`).join(', '));
    lines.push('Scored with Clutch Up Golf');
    return lines.join('\n');
  };

  /** Share a picture of the results (falls back to text). */
  const share = async () => {
    setSharing(true);
    track('results_shared');
    try {
      if (Platform.OS !== 'web' && (await Sharing.isAvailableAsync())) {
        const uri = await captureRef(shot, { format: 'png', quality: 1, result: 'tmpfile' });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share results' });
        return;
      }
      await Share.share({ message: shareText() });
    } catch {
      await Share.share({ message: shareText() }).catch(() => undefined);
    } finally {
      setSharing(false);
    }
  };

  return (
    <TeamColors picks={picks} names={names}>
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}>
        {/* Everything in here goes into the picture you share. */}
        <View ref={shot} collapsable={false} style={{ gap: space.md, backgroundColor: c.bg }}>
          <View style={{ borderRadius: radius.lg, overflow: 'hidden', backgroundColor: celebrate ? c.primary : c.card, borderWidth: celebrate ? 0 : 1, borderColor: c.border }}>
            <View style={{ height: 4, backgroundColor: c.accent }} />
            <View style={{ padding: space.lg, alignItems: 'center', gap: 4 }}>
              <Text style={{ color: celebrate ? '#E9D7B0' : c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, textAlign: 'center' }}>
                {courseName.toUpperCase()} · {date.toUpperCase()}
              </Text>
              {celebrate && <Text style={{ fontSize: 44 }}>🏆</Text>}
              <Text style={{ fontFamily: fonts.serif, fontSize: celebrate ? 34 : 28, fontWeight: '700', color: celebrate ? '#fff' : teamWinner ? teamColor(teamWinner, picks).color : c.text, textAlign: 'center' }}>
                {headline}
              </Text>
              {!!sub && <Text style={{ color: celebrate ? '#ffffffd9' : c.muted, fontSize: 14, textAlign: 'center' }}>{sub}</Text>}
              <Text style={{ color: celebrate ? '#ffffffb3' : c.muted, fontSize: 13 }}>{gameName(r.games[0])}{r.label ? ` · ${r.label}` : ''}</Text>
            </View>

            {teamRound && (
              <View style={{ flexDirection: 'row' }}>
                {teams.map((t) => {
                  const tc = teamColor(t.letter, picks);
                  const lead = t.letter === teamWinner;
                  return (
                    <View key={t.letter} style={{ flex: 1, alignItems: 'center', paddingVertical: space.md, backgroundColor: tc.color, opacity: teamWinner && !lead ? 0.7 : 1 }}>
                      <Text style={{ color: '#ffffffd9', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>{tn(t.letter).toUpperCase()}{lead ? ' 🏆' : ''}</Text>
                      <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 34, fontWeight: '700' }}>{pts(t.points)}</Text>
                      <Text style={{ color: '#ffffffcc', fontSize: 11, fontWeight: '600' }}>{t.wins}W · {t.halves}H · {t.losses}L</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {teamRound && (
            <Card>
              <H2>Team summary</H2>
              {teams.map((t, i) => {
                const tc = teamColor(t.letter, picks);
                return (
                  <View key={t.letter} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: tc.color, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontWeight: '800' }}>{t.letter}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={2} style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>{t.members.map((x) => name(x).split(' ')[0]).join(', ')}</Text>
                      <Text style={{ color: c.muted, fontSize: 12 }}>{t.wins} won · {t.halves} halved · {t.losses} lost</Text>
                    </View>
                    <Text style={{ color: tc.color, fontFamily: fonts.serif, fontSize: 26, fontWeight: '700' }}>{pts(t.points)}</Text>
                  </View>
                );
              })}
              <Text style={{ color: c.muted, fontSize: 12 }}>{matches.some((m) => r.games[m.gi].type === 'nassau') ? 'Nassau matches count their points (front 9, back 9, overall and presses). Other matches: 1 point for a win, ½ for a halve.' : '1 point for a win, ½ for a halved match.'}</Text>
            </Card>
          )}

          {matches.length > 0 && (
            <Card>
              <H2>{matches.length > 1 ? 'Matches' : 'Match'}</H2>
              {matches.map((m) => (
                <View key={m.gi} style={{ gap: 6, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: c.border }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }}>
                    <Label>{m.title}</Label>
                    <Text style={{ color: m.winner === 'halved' ? c.accent : c.muted, fontWeight: '800', fontSize: 11, letterSpacing: 1 }}>
                      {m.winner === 'halved' ? 'HALVED' : m.winner ? 'FINAL' : m.detail.toUpperCase()}
                    </Text>
                  </View>
                  <Pressable onPress={() => router.push(`/round/${r.id}/match/${m.gi}`)} accessibilityRole="button" accessibilityLabel={`${m.title} details`} style={({ pressed }) => ({ gap: 6, opacity: pressed ? 0.7 : 1 })}>
                    <SideRow m={m} s={m.a} which="a" showTeam={teamRound} me={m.a.members.some((x) => myIds.includes(x))} />
                    <SideRow m={m} s={m.b} which="b" showTeam={teamRound} me={m.b.members.some((x) => myIds.includes(x))} />
                    {isResult(results[m.gi] as GameResult | { error: string }) && (
                      <MatchStory r={r} res={results[m.gi] as GameResult} m={m} holes={storyHoles(r, results[m.gi] as GameResult, m, c)} compact />
                    )}
                    <Text style={{ color: c.primary, fontWeight: '700', fontSize: 14, textAlign: 'right' }}>Match details & scorecard ›</Text>
                  </Pressable>
                </View>
              ))}
            </Card>
          )}

          {rows.length > 0 && (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <H2>Scores</H2>
                <Text style={{ color: c.muted, fontSize: 12 }}>Tap {scoreView === 'teams' ? 'a team' : 'a player'} for their card</Text>
              </View>
              {teamRows.length > 0 && (
                <Segmented options={[{ value: 'players', label: 'Players' }, { value: 'teams', label: 'Teams' }]} value={scoreView} onChange={(v) => { setScoreView(v); setOpen(null); }} />
              )}
              {scoreView === 'teams' && <Text style={{ color: c.muted, fontSize: 12 }}>The score that counted for each team on every hole{teamNet ? ' (net, after handicap strokes)' : ''}.</Text>}
              <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <Text style={{ flex: 1, color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>{scoreView === 'teams' ? 'TEAM' : 'PLAYER'}</Text>
                {['OUT', 'IN', 'TOT', '+/−'].map((h) => (
                  <Text key={h} style={{ width: h === 'TOT' ? 46 : 40, textAlign: 'center', color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>{h}</Text>
                ))}
              </View>
              {(scoreView === 'teams' ? teamRows : rows).map((x) => {
                const tc = x.letter ? teamColor(x.letter, picks) : null;
                const isOpen = open === x.k.key;
                return (
                  <View key={x.k.key} style={{ borderBottomWidth: 1, borderBottomColor: c.border }}>
                    <Pressable
                      onPress={() => setOpen(isOpen ? null : x.k.key)}
                      accessibilityRole="button"
                      accessibilityLabel={`${x.k.label} scorecard`}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, opacity: pressed ? 0.6 : 1 })}>
                      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {tc && <View style={{ width: 4, height: 22, borderRadius: 2, backgroundColor: tc.color }} />}
                        <Text numberOfLines={1} style={{ flexShrink: 1, color: c.text, fontSize: 15, fontWeight: '600' }}>{x.k.label}</Text>
                        {!x.k.isTeam && isMe(x.k.key) && <MeBadge small />}
                        {x.sub ? <Text numberOfLines={1} style={{ color: c.muted, fontSize: 11 }}>{x.sub}</Text> : null}
                        <Text style={{ color: c.muted, fontSize: 12 }}>{isOpen ? '▴' : '▾'}</Text>
                      </View>
                      <Text style={{ width: 40, textAlign: 'center', color: c.text, fontSize: 15 }}>{x.out ?? '–'}</Text>
                      <Text style={{ width: 40, textAlign: 'center', color: c.text, fontSize: 15 }}>{x.inn ?? '–'}</Text>
                      <Text style={{ width: 46, textAlign: 'center', color: c.text, fontSize: 17, fontWeight: '800', fontFamily: fonts.serif }}>{x.tot}</Text>
                      <Text style={{ width: 40, textAlign: 'center', color: x.toPar < 0 ? c.under : c.text, fontSize: 14, fontWeight: '700' }}>{toPar(x.toPar)}</Text>
                    </Pressable>
                    {x.holes < roundHoleCount(r) && <Text style={{ color: c.muted, fontSize: 11, marginTop: -8, marginBottom: 6 }}>{x.holes} holes played</Text>}
                    {isOpen && <PlayerCard g={x.g} tee={x.tee} />}
                  </View>
                );
              })}
            </Card>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 4 }}>
            <LogoMark size={22} badge />
            <Text style={{ color: c.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>SCORED WITH CLUTCH UP</Text>
          </View>
        </View>

        <Button title={sharing ? 'Getting it ready…' : 'Share results'} onPress={share} disabled={sharing} />

        {event && (
          <Pressable onPress={() => router.push(`/event/${event.id}`)} accessibilityRole="button" accessibilityLabel={`${event.name} standings`}>
            {({ pressed }) => (
              <Card style={{ opacity: pressed ? 0.7 : 1, borderColor: c.accent }}>
                <Label>{r.label ? `${r.label} of ` : 'Part of '}{event.name}</Label>
                {overall && overall.length >= 2 ? (
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    {[...overall].sort((x, y) => x.letter.localeCompare(y.letter)).map((t) => (
                      <View key={t.letter} style={{ flex: 1, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: teamColor(t.letter, picks).soft }}>
                        <Text style={{ color: teamColor(t.letter, picks).color, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>{tn(t.letter).toUpperCase()}</Text>
                        <Text style={{ color: teamColor(t.letter, picks).color, fontFamily: fonts.serif, fontSize: 28, fontWeight: '700' }}>{pts(t.points)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                <Text style={{ color: c.primary, fontWeight: '700' }}>{overall && overall.length >= 2 ? 'Overall standings' : 'Event standings'} ›</Text>
              </Card>
            )}
          </Pressable>
        )}

        <GameSummaryList items={others.map(({ g, i }) => ({ key: i, name: gameTitle(g, r.players), result: results[i] as GameResult | { error: string }, sides: resultSides[i] }))} players={r.players} />

        {r.statsEnabled &&
          rows.filter((x) => !x.k.isTeam).map((x) => {
            const scores = Array.from({ length: 18 }, (_, i) => x.g(i + 1));
            const s = summarizeStats(scores, r.stats[x.k.key] ?? [], x.tee.holes);
            return (
              <Card key={x.k.key}>
                <H2>{x.k.label} · stats</H2>
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

        <Button title="Done" kind="secondary" onPress={() => router.dismissTo('/')} />
        <AddToEvent r={r} />
        {/* People following along can't change the scores. */}
        {r.remote?.role !== 'viewer' && (
          <Button
            title={r.fromPhoto ? 'Edit scores' : 'Reopen scorecard'}
            kind="secondary"
            onPress={() => {
              reopen(r.id);
              router.replace(r.fromPhoto ? `/round/${r.id}?view=card` : `/round/${r.id}`);
            }}
          />
        )}
      </ScrollView>
      {celebrate && <Confetti />}
      <Tip
        id="results"
        title="Your results"
        lines={['Tap any match to see it hole by hole, with an AI-written recap.', 'Tap “Share results” to send a picture of the scorecard to your group.']}
      />
    </View>
    </TeamColors>
  );
}

/** One player's card: par and score for each hole, front nine and back nine. */
function PlayerCard({ g, tee }: { g: (h: number) => number | null; tee: ReturnType<typeof teeFor> }) {
  const c = useColors();
  const cell = { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const };
  const nine = (holes: number[], label: string) => {
    const par = holes.reduce((s, h) => s + tee.holes[h - 1].par, 0);
    const played = holes.filter((h) => g(h) !== null);
    const tot = played.reduce((s, h) => s + (g(h) ?? 0), 0);
    return (
      <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', backgroundColor: c.primary, paddingVertical: 3 }}>
          {holes.map((h) => <View key={h} style={cell}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{h}</Text></View>)}
          <View style={[cell, { flex: 1.4 }]}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{label}</Text></View>
        </View>
        <View style={{ flexDirection: 'row', backgroundColor: c.bg, paddingVertical: 2 }}>
          {holes.map((h) => <View key={h} style={cell}><Text style={{ color: c.muted, fontSize: 11 }}>{tee.holes[h - 1].par}</Text></View>)}
          <View style={[cell, { flex: 1.4 }]}><Text style={{ color: c.muted, fontSize: 11, fontWeight: '700' }}>{par}</Text></View>
        </View>
        <View style={{ flexDirection: 'row', paddingVertical: 2 }}>
          {holes.map((h) => <View key={h} style={cell}><Mark gross={g(h)} par={tee.holes[h - 1].par} dot={0} /></View>)}
          <View style={[cell, { flex: 1.4 }]}><Text style={{ color: c.text, fontWeight: '800', fontSize: 14 }}>{played.length ? tot : '–'}</Text></View>
        </View>
      </View>
    );
  };
  return (
    <View style={{ gap: space.sm, paddingBottom: space.md }}>
      {/* A nine-hole round shows only the nine that was played. */}
      {(FRONT.some((h) => g(h) !== null) || !BACK.some((h) => g(h) !== null)) && nine(FRONT, 'OUT')}
      {(BACK.some((h) => g(h) !== null) || !FRONT.some((h) => g(h) !== null)) && nine(BACK, 'IN')}
      <Text style={{ color: c.muted, fontSize: 11 }}>○ birdie  ◎ eagle  □ bogey  ⧈ double+</Text>
    </View>
  );
}
