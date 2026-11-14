/**
 * Finishing an event: whether it can be completed yet (no rounds left to play), and its final summary — the winning
 * team and final score, or (no teams) the champion, 2nd and 3rd with their points.
 */
import { fedexStandings } from '@golf/engine';

import { cupScore, eventStandings, eventTeamTotals, formatPoints } from '@/lib/events';
import { fedexResults } from '@/lib/fedex';
import { fmtIndividual, individualRounds, individualTable } from '@/lib/individual';
import { teamName, namesFor } from '@/lib/team-colors';
import type { EventRecord, RoundRecord } from '@/store/store';
import { teamColor } from '@/theme';

/** What's still to play: rounds being played, planned rounds not played yet, and scheduled matches not started. */
export function leftovers(e: EventRecord, rounds: RoundRecord[]) {
  const mine = rounds.filter((r) => r.eventId === e.id);
  const live = mine.filter((r) => r.status === 'active');
  const planned = (e.rounds ?? []).filter((p) => !p.roundId || !mine.some((r) => r.id === p.roundId));
  const scheduled = (e.schedule ?? []).filter((m) => !m.roundId);
  return { live, planned, scheduled, count: live.length + planned.length + scheduled.length, played: mine.some((r) => r.status === 'complete') || !!e.fedex?.imported?.length };
}

/** Why the event can't be completed yet (null = it can). */
export function completeBlocker(e: EventRecord, rounds: RoundRecord[]): string | null {
  const mine = rounds.filter((r) => r.eventId === e.id);
  const live = mine.filter((r) => r.status === 'active').length;
  const planned = (e.rounds ?? []).filter((p) => !p.roundId || !mine.some((r) => r.id === p.roundId)).length;
  const scheduled = (e.schedule ?? []).filter((m) => !m.roundId).length;
  const left = planned + scheduled;
  if (live) return `${live} round${live === 1 ? ' is' : 's are'} still being played. Finish ${live === 1 ? 'it' : 'them'} first.`;
  if (left) return `${left} round${left === 1 ? ' is' : 's are'} still scheduled. Play or delete ${left === 1 ? 'it' : 'them'} to complete the event.`;
  if (!mine.some((r) => r.status === 'complete') && !e.fedex?.imported?.length) return 'Play at least one round first.';
  return null;
}

export type Podium = { playerId: string; position: number; score: string; detail?: string }[];
export type TeamResult = { letter: string; name: string; color: string; points: number; members: string[] };

export type EventSummary =
  | { kind: 'teams'; teams: TeamResult[]; tie: boolean; note?: string; rounds: number }
  | { kind: 'players'; podium: Podium; rounds: number; label: string };

export function eventSummary(e: EventRecord, rounds: RoundRecord[]): EventSummary {
  const played = rounds.filter((r) => r.eventId === e.id && r.status === 'complete').length;
  // Individual points: everyone's own season total.
  if (e.individual && !e.fedex) {
    const rows = individualTable(e, rounds).filter((r) => r.rounds > 0);
    return {
      kind: 'players',
      label: 'Individual points',
      rounds: individualRounds(e, rounds).length,
      podium: rows.filter((r) => r.position <= 3).map((r) => ({ playerId: r.playerId, position: r.position, score: `${fmtIndividual(r.points)} pts`, detail: `${r.wins}-${r.losses}-${r.halves} (W-L-H)${r.firsts ? ` · ${r.firsts} win${r.firsts === 1 ? '' : 's'} in other games` : ''}` })),
    };
  }
  // Ryder Cup: the two teams' cup points (the holder keeps the cup on a tie).
  if (e.teams) {
    const s = cupScore(e, rounds).standings;
    const teams: TeamResult[] = (['A', 'B'] as const).map((L) => ({ letter: L, name: e.teams![L].name, color: teamColor(L, e.teamColors).color, points: L === 'A' ? s.teamA : s.teamB, members: e.teams![L].playerIds }));
    teams.sort((a, b) => b.points - a.points);
    const tie = teams[0].points === teams[1].points;
    const keep = tie && e.holder ? teams.find((t) => t.letter === e.holder) : undefined;
    if (keep) teams.sort((a) => (a === keep ? -1 : 1));
    return { kind: 'teams', teams, tie: tie && !keep, note: keep ? `${keep.name} keep the cup on a tie.` : undefined, rounds: played };
  }
  // Team events: each team's points across every round.
  if (e.teamOf && (e.teamLetters?.length ?? 0) >= 2) {
    const nm = namesFor(undefined, e);
    const teams = eventTeamTotals(e, rounds).totals.map((t) => ({ letter: t.letter, name: teamName(t.letter, nm), color: teamColor(t.letter, e.teamColors).color, points: t.points, members: t.members }));
    teams.sort((a, b) => b.points - a.points);
    return { kind: 'teams', teams, tie: teams.length > 1 && teams[0].points === teams[1].points, rounds: played };
  }
  // Points Race: season standings (best rounds).
  if (e.fedex) {
    const results = fedexResults(e, rounds);
    const rows = fedexStandings(results, e.fedex, 'season', e.playerIds).filter((r) => r.played > 0);
    return {
      kind: 'players',
      label: `Best ${e.fedex.best.season} rounds`,
      rounds: results.length,
      podium: rows.filter((r) => r.position <= 3).map((r) => ({ playerId: r.playerId, position: r.position, score: `${Number.isInteger(r.points) ? r.points : r.points.toFixed(1)} pts`, detail: `${r.played} rounds · avg ${r.average.toFixed(1)}` })),
    };
  }
  // Everyone for themselves: standings points from every match.
  const rows = eventStandings(e, rounds).filter((r) => r.played > 0);
  return {
    kind: 'players',
    label: 'Standings points',
    rounds: played,
    podium: rows.filter((r) => r.position <= 3).map((r) => ({ playerId: r.playerId, position: r.position, score: `${formatPoints(r.points)} pts`, detail: `${r.wins}-${r.losses}-${r.halves} (W-L-H)` })),
  };
}
