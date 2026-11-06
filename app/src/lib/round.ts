import {
  evaluateGame,
  ledgerToScorecard,
  postingReminders,
  type Course,
  type GameResult,
  type RecordedMatch,
  type Round,
} from '@golf/engine';

import type { RoundRecord } from '@/store/store';
import { getCourse } from './courses';
import { teamCardKeys } from './games';

export interface ScoreKey {
  key: string;
  label: string;
  /** Player ids whose tee/par apply to this row. */
  members: string[];
  isTeam: boolean;
}

/** "Willow Park", "Indian Ridge · Arroyo" */
export function shortCourseName(name: string): string {
  const [club, course] = name.split(' – ');
  const short = club.replace(/\s+(Golf\s*(&|and)\s*)?Country Club$/i, '').replace(/\s+Golf (Club|Course)$/i, '');
  return course ? `${short} · ${course}` : short;
}

export function courseFor(r: RoundRecord): Course {
  const c = r.course ?? getCourse(r.courseId);
  if (!c) throw new Error(`Course ${r.courseId} is missing`);
  return c;
}

/** Rows on the scorecard: one per player, plus one per team for team-ball formats. */
export function scoreKeys(r: RoundRecord): ScoreKey[] {
  const name = (id: string) => r.players.find((p) => p.id === id)?.name ?? id;
  const teamKeys = r.games.flatMap(teamCardKeys);
  const teamMembers = new Set(teamKeys.flatMap((t) => t.members));
  const keys: ScoreKey[] = [];
  const seen = new Set<string>();
  for (const t of teamKeys) {
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    keys.push({ key: t.key, label: t.members.map(name).join(' & '), members: t.members, isTeam: true });
  }
  // Individual rows for anyone who also plays their own ball in some game.
  const individual = r.games.some((g) => teamCardKeys(g).length === 0);
  for (const p of r.players) {
    if (teamMembers.has(p.id) && !individual) continue;
    keys.push({ key: p.id, label: p.name, members: [p.id], isTeam: false });
  }
  return keys;
}

export function engineRound(r: RoundRecord): Round {
  return {
    course: courseFor(r),
    players: r.players,
    scores: ledgerToScorecard(r.ledger, scoreKeys(r).map((k) => k.key), 18),
  };
}

export function evaluate(r: RoundRecord): (GameResult | { error: string })[] {
  const round = engineRound(r);
  return r.games.map((g) => {
    try {
      return evaluateGame(round, g);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });
}

export const isResult = (x: GameResult | { error: string }): x is GameResult => !('error' in x);

export function grossAt(r: RoundRecord, key: string, hole: number): number | null {
  return r.ledger[`${key}#${hole}`]?.gross ?? null;
}

export function holesComplete(r: RoundRecord): number {
  const keys = scoreKeys(r);
  let n = 0;
  for (let h = 1; h <= 18; h++) if (keys.every((k) => grossAt(r, k.key, h) !== null)) n++;
  return n;
}

/** Finished head-to-head matches from this round, for history and standings. */
export function recordedMatches(r: RoundRecord, results: GameResult[]): RecordedMatch[] {
  const out: RecordedMatch[] = [];
  r.games.forEach((g, i) => {
    const res = results[i];
    if (!res || !res.finished) return;
    if (g.type !== 'matchPlay' && g.type !== 'nassau' && g.type !== 'vegas') return;
    const sideA = g.type === 'vegas' ? g.teamA.members : g.sideA.members;
    const sideB = g.type === 'vegas' ? g.teamB.members : g.sideB.members;
    const aId = g.type === 'vegas' ? g.teamA.id : g.sideA.id;
    const result = res.winnerIds.length === 0 ? 'halved' : res.winnerIds[0] === aId ? 'A' : 'B';
    out.push({
      id: `${r.id}-${i}`,
      date: new Date(r.createdAt).toISOString().slice(0, 10),
      eventId: r.id,
      format: g.type === 'matchPlay' ? g.format : g.type,
      sideA: [...sideA],
      sideB: [...sideB],
      result,
      summary: res.summary,
    });
  });
  return out;
}

export function postingList(r: RoundRecord): string[] {
  return postingReminders(r.games);
}

export function teeFor(r: RoundRecord, playerId: string) {
  const course = courseFor(r);
  const p = r.players.find((x) => x.id === playerId);
  return course.tees.find((t) => t.id === p?.teeId) ?? course.tees[0];
}
