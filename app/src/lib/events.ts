import { cupStandings, seasonStandings, type CupMatch, type GameResult, type RecordedMatch } from '@golf/engine';

import type { EventRecord, RoundRecord } from '@/store/store';
import { gameName } from './games';
import { roundTeamScore, type TeamTotal } from './results';
import { evaluate, isResult, holesComplete } from './round';

export interface EventMatch {
  id: string;
  roundId: string;
  name: string;
  sideA: string[];
  sideB: string[];
  /** Final result (null while in progress). */
  result: 'A' | 'B' | 'halved' | null;
  /** Who is ahead right now. */
  leader: 'A' | 'B' | 'halved' | null;
  summary: string;
  thru: number;
  date: string;
}

function sidesOf(r: RoundRecord, i: number): [string[], string[]] | null {
  const g = r.games[i];
  if (g.type === 'matchPlay' || g.type === 'nassau') return [g.sideA.members, g.sideB.members];
  if (g.type === 'vegas') return [g.teamA.members, g.teamB.members];
  return null;
}

function outcome(res: GameResult, aId: string): { result: EventMatch['result']; leader: EventMatch['leader'] } {
  const a = res.standings.find((s) => s.id === aId)?.value ?? 0;
  const b = res.standings.find((s) => s.id !== aId)?.value ?? 0;
  const leader = res.thru === 0 ? null : a > b ? 'A' : b > a ? 'B' : 'halved';
  if (!res.finished) return { result: null, leader };
  return { result: res.winnerIds.length === 0 ? 'halved' : res.winnerIds[0] === aId ? 'A' : 'B', leader };
}

/** Every head-to-head match played in the event's rounds. */
export function eventMatches(e: EventRecord, rounds: RoundRecord[]): EventMatch[] {
  const out: EventMatch[] = [];
  for (const r of rounds.filter((x) => x.eventId === e.id).sort((a, b) => a.createdAt - b.createdAt)) {
    const results = evaluate(r);
    r.games.forEach((g, i) => {
      const sides = sidesOf(r, i);
      const res = results[i];
      if (!sides || !res || !isResult(res)) return;
      const aId = g.type === 'vegas' ? g.teamA.id : (g as { sideA: { id: string } }).sideA.id;
      let [sideA, sideB] = sides;
      let { result, leader } = outcome(res, aId);
      // Cup: orient every match so side A is the event's Team A.
      if (e.teams && sideA.every((p) => e.teams!.B.playerIds.includes(p))) {
        [sideA, sideB] = [sideB, sideA];
        const flip = (x: typeof result) => (x === 'A' ? 'B' : x === 'B' ? 'A' : x);
        result = flip(result);
        leader = flip(leader);
      }
      out.push({
        id: `${r.id}-${i}`,
        roundId: r.id,
        name: gameName(g),
        sideA: [...sideA],
        sideB: [...sideB],
        result,
        leader,
        summary: res.summary,
        thru: res.thru,
        date: new Date(r.createdAt).toISOString().slice(0, 10),
      });
    });
  }
  return out;
}

const isCupMatch = (e: EventRecord, m: EventMatch) =>
  !!e.teams && m.sideA.every((p) => e.teams!.A.playerIds.includes(p)) && m.sideB.every((p) => e.teams!.B.playerIds.includes(p));

export function cupScore(e: EventRecord, rounds: RoundRecord[]) {
  const matches = eventMatches(e, rounds).filter((m) => isCupMatch(e, m));
  const cup: CupMatch[] = matches.map((m) => ({ id: m.id, sideA: m.sideA, sideB: m.sideB, result: m.result }));
  // Matches not yet set up still count toward the points on offer.
  const unplanned = (e.cupPoints ?? 0) - cup.length;
  if (unplanned > 0) cup.push({ id: 'unplayed', sideA: [], sideB: [], result: null, points: unplanned });
  const liveLeaders = Object.fromEntries(matches.filter((m) => m.result === null && m.leader).map((m) => [m.id, m.leader!]));
  return { matches, standings: cupStandings(cup, { holder: e.holder, liveLeaders }) };
}

export function eventStandings(e: EventRecord, rounds: RoundRecord[]) {
  const recorded: RecordedMatch[] = eventMatches(e, rounds)
    .filter((m) => m.result !== null)
    .map((m) => ({ id: m.id, date: m.date, format: m.name, sideA: m.sideA, sideB: m.sideB, result: m.result! }));
  const rows = seasonStandings(recorded, e.points);
  // Include players with no matches yet.
  for (const id of e.playerIds) if (!rows.some((r) => r.playerId === id)) rows.push({ playerId: id, played: 0, wins: 0, losses: 0, halves: 0, points: 0, position: 0 });
  rows.forEach((r) => (r.position = 1 + rows.filter((o) => o.points > r.points).length));
  return rows;
}

const FORMAT_NAMES: Record<string, string> = {
  singles: 'Singles',
  fourBall: 'Best Ball',
  foursomes: 'Alternate Shot',
  nassau: 'Nassau',
  vegas: 'Vegas',
};
export const formatName = (f: string) => FORMAT_NAMES[f] ?? f;

export function formatPoints(n: number): string {
  const whole = Math.floor(n);
  return n - whole === 0.5 ? (whole === 0 ? '½' : `${whole}½`) : String(n);
}

export type EventPhase = 'live' | 'upcoming' | 'completed';

/**
 * live: a round in the event is being played.
 * upcoming: nothing started yet, or scheduled matches still to play.
 * completed: it has finished rounds and nothing left to play.
 */
export function eventPhase(e: EventRecord, rounds: RoundRecord[]): EventPhase {
  const mine = rounds.filter((r) => r.eventId === e.id);
  if (mine.some((r) => r.status === 'active')) return 'live';
  if (e.status === 'complete') return 'completed';
  const unplayed = (e.schedule ?? []).some((m) => !m.roundId || !mine.some((r) => r.id === m.roundId));
  const unplayedRounds = (e.rounds ?? []).some((x) => !x.roundId || !mine.some((r) => r.id === x.roundId && r.status === 'complete'));
  if (mine.length === 0 || unplayed || unplayedRounds) return 'upcoming';
  return 'completed';
}

/** Events can only be deleted before any of their rounds are finished. */
export function canDeleteEvent(e: EventRecord, rounds: RoundRecord[]): boolean {
  return !rounds.some((r) => r.eventId === e.id && (r.status === 'complete' || (r.completedAt && holesComplete(r) >= 18)));
}

/** Team points across every round of the event (for events with teams). */
export function eventTeamTotals(e: EventRecord, rounds: RoundRecord[]): { totals: TeamTotal[]; roundsCounted: number } {
  const by = new Map<string, TeamTotal>();
  for (const L of e.teamLetters ?? []) by.set(L, { letter: L, members: Object.keys(e.teamOf ?? {}).filter((id) => e.teamOf![id] === L), points: 0, wins: 0, halves: 0, losses: 0 });
  let roundsCounted = 0;
  for (const r of rounds.filter((x) => x.eventId === e.id)) {
    const score = roundTeamScore(r, evaluate(r));
    if (!score) continue;
    roundsCounted++;
    for (const t of score) {
      const cur = by.get(t.letter) ?? { letter: t.letter, members: t.members, points: 0, wins: 0, halves: 0, losses: 0 };
      by.set(t.letter, { ...cur, points: cur.points + t.points, wins: cur.wins + t.wins, halves: cur.halves + t.halves, losses: cur.losses + t.losses });
    }
  }
  return { totals: [...by.values()].sort((a, b) => b.points - a.points || a.letter.localeCompare(b.letter)), roundsCounted };
}
