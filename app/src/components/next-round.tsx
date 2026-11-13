/**
 * Event page: the round that matters right now. The live round if one is being played, otherwise the next one coming up
 * (with Start round on its day, or a countdown before then).
 */
import { openPaywall, usePro } from '@/lib/pro';
import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { Countdown } from '@/components/countdown';
import { boardMatches, LiveMatchRow } from '@/components/match-strip';
import { formatDate, today } from '@/lib/dates';
import { formatPoints, planName } from '@/lib/events';
import { canStartOn } from '@/lib/event-calendar';
import { gameInfo, gameName, gameTitle, matchLabel } from '@/lib/games';
import { roundTeamScore } from '@/lib/results';
import { getCourse } from '@/lib/courses';
import { courseFor, evaluate, isResult, shortCourseName } from '@/lib/round';
import { useStore, type EventRecord, type EventRound, type RoundRecord } from '@/store/store';
import { fonts, radius, space, teamColor, useColors } from '@/theme';
import { namesFor, teamName, picksFor } from '@/lib/team-colors';

/** The featured round: live first, else the first planned round not yet played. */
export function featuredRound(e: EventRecord, rounds: RoundRecord[]): { plan?: EventRound; round?: RoundRecord } | null {
  const mine = rounds.filter((r) => r.eventId === e.id);
  const live = mine.find((r) => r.status === 'active');
  if (live) return { round: live, plan: e.rounds?.find((x) => x.roundId === live.id) };
  if (e.status === 'complete') return null;
  const t = today();
  const plan = (e.rounds ?? []).find((x) => !(x.roundId && mine.some((r) => r.id === x.roundId)) && (!x.date || x.date >= t));
  return plan ? { plan } : null;
}

export function NextRound({ e }: { e: EventRecord }) {
  const c = useColors();
  const rounds = useStore((s) => s.rounds);
  const players = useStore((s) => s.players);
  const f = featuredRound(e, rounds);
  if (!f) return null;
  const { plan, round } = f;
  const canEdit = e.remote?.role !== 'viewer';
  const first = (id: string) => (players.find((p) => p.id === id)?.name ?? round?.players.find((p) => p.id === id)?.name ?? '?').split(' ')[0];
  const title = round?.label ?? (plan ? planName(plan) : 'Round');
  const isToday = !!plan && !round && canStartOn(plan.date);

  // ---- live
  if (round) {
    const results = evaluate(round);
    const score = roundTeamScore(round, results);
    let course = '';
    try { course = shortCourseName(courseFor(round).name); } catch { /* course missing */ }
    const matches = round.games.map((g, i) => ({ g, res: results[i] })).filter(({ g }) => matchLabel(g) || round.games.length === 1);
    const teamMatches = boardMatches(round, results);
    // Team A (or the event's first team) on the left, as on the TV board.
    const leftLetter = e.teams ? 'A' : e.teamLetters?.[0];
    return (
      <Shell accent={c.under} label={`● LIVE NOW · ${title.toUpperCase()}`} title={gameName(round.games[0])} sub={course}>
        {score && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {score.map((t) => (
              <View key={t.letter} style={{ flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: radius.md, backgroundColor: teamColor(t.letter, picksFor(round, e)).color }}>
                <Text style={{ color: '#ffffffcc', fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>{teamName(t.letter, namesFor(round, e)).toUpperCase()}</Text>
                <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 24, fontWeight: '700' }}>{formatPoints(t.points)}</Text>
              </View>
            ))}
          </View>
        )}
        {/* Team matches in the scoreboard look (as on the TV board); other formats keep the simple list. */}
        {teamMatches.length ? (
          <View style={{ gap: 6 }}>
            {teamMatches.map((m) => (
              <LiveMatchRow key={m.gi} r={round} results={results} m={m} leftLetter={leftLetter} picks={picksFor(round, e)} onPress={() => router.push(`/round/${round.id}`)} />
            ))}
          </View>
        ) : matches.slice(0, 6).map(({ g, res }, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
            <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14 }}>{gameTitle(g, round.players)}</Text>
            <Text style={{ color: c.primary, fontWeight: '700', fontSize: 14 }}>{res && isResult(res) ? (res.thru ? res.summary : 'Not started') : ''}</Text>
          </View>
        ))}
        <Button title={round.remote?.role === 'viewer' ? 'Follow live ›' : 'Open live scoring ›'} onPress={() => router.push(`/round/${round.id}`)} />
        {round.remote?.role !== 'viewer' && (
          // Kept score on paper: read the card straight into this round.
          <Button kind="secondary" title="📷 Upload scorecard" onPress={() => (usePro.getState().pro ? router.push(`/round/${round.id}/upload-card`) : openPaywall('scorecard'))} />
        )}
      </Shell>
    );
  }

  // ---- coming up
  const p = plan!;
  const fmt = p.draft ? gameInfo(p.draft.kind).name : 'Format to be decided';
  const setupCourse = p.setup ? getCourse(p.setup.courseId)?.name : undefined;
  const when = !p.date ? 'Date to be decided' : p.date === today() ? 'Today' : formatDate(p.date, { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <Shell accent={isToday ? c.accent : c.primary} label={`${isToday ? '📅 TODAY' : 'UP NEXT'} · ${title.toUpperCase()}`} title={fmt} sub={[when, setupCourse ? shortCourseName(setupCourse) : null].filter(Boolean).join(' · ')}>
      {p.matchupsLater ? (
        <Text style={{ color: c.muted, fontSize: 14 }}>Matchups are decided on the day.</Text>
      ) : (
        p.draft?.matches.map((m, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
            <Text style={{ color: c.muted, fontSize: 11, fontWeight: '800', width: 54 }}>MATCH {i + 1}</Text>
            <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14 }}>
              <Text style={{ fontWeight: '700' }}>{m.a.map(first).join(' & ')}</Text>
              <Text style={{ color: c.muted }}>  v  </Text>
              <Text style={{ fontWeight: '700' }}>{m.b.map(first).join(' & ')}</Text>
            </Text>
          </View>
        ))
      )}
      {/* Before the event starts, its own countdown is at the top of the page. */}
      {!isToday && p.date && p.date > today() && !(e.startDate && e.startDate > today()) && <Countdown compact target={{ event: e, label: `${e.name} · ${title}`, date: p.date, kind: 'round' }} />}
      {canEdit && (isToday || !p.date) && (
        <Button title="Start round ›" onPress={() => router.push({ pathname: '/new-round', params: { eventId: e.id, eventRound: p.id } })} />
      )}
      {canEdit && !isToday && p.date && p.date > today() && (
        <Button kind="secondary" title={p.setup ? 'Edit round setup ›' : 'Set up this round ahead ›'} onPress={() => router.push({ pathname: '/new-round', params: { eventId: e.id, eventRound: p.id } })} />
      )}
    </Shell>
  );
}

function Shell({ accent, label, title, sub, children }: { accent: string; label: string; title: string; sub?: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 2, borderColor: accent, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
      <View style={{ height: 4, backgroundColor: accent }} />
      <View style={{ padding: space.lg, gap: space.sm }}>
        <Text style={{ color: accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>{label}</Text>
        <View>
          <Text style={{ color: c.text, fontFamily: fonts.serif, fontSize: 22, fontWeight: '700' }}>{title}</Text>
          {sub ? <Text style={{ color: c.muted, fontSize: 13 }}>{sub}</Text> : null}
        </View>
        {children}
      </View>
    </View>
  );
}
