/**
 * How many holes a game covers and where it starts: 18 or 9 holes, starting on hole 1, 10 or any hole
 * (shotgun starts). Games are scored in the order the holes are played, and the results are mapped
 * back to real hole numbers (index 0 = hole 1) so scorecards keep working.
 */
import type { MatchStatus } from './matchplay';
import type { Round, Tee } from './types';

export interface PlaySpec {
  holes: 9 | 18;
  /** Real hole number the game starts on (1-18). */
  start: number;
}

/** Real hole numbers in the order they're played, e.g. 9 holes from 10 → [10..18]; 18 from 10 → [10..18, 1..9]. */
export function holeOrder(spec?: Partial<PlaySpec> | null, total = 18): number[] {
  const n = spec?.holes === 9 && total > 9 ? 9 : total;
  const start = Math.min(Math.max(Math.round(spec?.start ?? 1), 1), total);
  return Array.from({ length: n }, (_, i) => ((start - 1 + i) % total) + 1);
}

/** True for the usual 18 holes from hole 1 (nothing to remap). */
export const isStandardPlay = (spec?: Partial<PlaySpec> | null) => !spec || (spec.holes !== 9 && (spec.start ?? 1) === 1);

/** A tee as seen by a game: holes in playing order; for nine holes, half the course handicap. */
function teeFor(t: Tee, order: number[], nine: boolean): Tee {
  const holes = order.map((n) => t.holes[n - 1]).filter(Boolean);
  if (!nine) return { ...t, holes };
  // WHS-style 9-hole course handicap: half the 18-hole course handicap.
  // Index × (slope/2)/113 + (CR9 − par9), with CR9 − par9 = (CR − par)/2.
  const par = holes.reduce((s, h) => s + h.par, 0);
  return { ...t, holes, par, slope: t.slope / 2, courseRating: par + (t.courseRating - t.par) / 2 };
}

/** The round as one game sees it: holes and scores in playing order. */
export function viewRound(round: Round, order: number[], nine: boolean): Round {
  return {
    ...round,
    course: { ...round.course, tees: round.course.tees.map((t) => teeFor(t, order, nine)) },
    scores: Object.fromEntries(Object.entries(round.scores).map(([k, arr]) => [k, order.map((n) => arr?.[n - 1] ?? null)])),
  };
}

/** Played-order array → real-hole array (length `total`), `fill` for holes not in this game. */
export function toReal<T>(arr: T[], order: number[], fill: T, total = 18, offset = 0): T[] {
  const out = new Array<T>(total).fill(fill);
  arr.forEach((v, i) => {
    const n = order[i + offset];
    if (n) out[n - 1] = v;
  });
  return out;
}

/** A match status whose outcomes are in playing order → outcomes by real hole. */
export function realStatus(s: MatchStatus, order: number[], total = 18, offset = 0): MatchStatus {
  return { ...s, outcomes: toReal(s.outcomes, order, null, total, offset) };
}
