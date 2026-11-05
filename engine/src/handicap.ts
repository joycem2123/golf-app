import type { HandicapMode, Hole, Tee } from './types';

/** WHS rounding: nearest whole number, .5 rounds up. Guards against float noise. */
export function roundHalfUp(x: number): number {
  return Math.round(Number(x.toFixed(8))) || 0; // `|| 0` turns -0 into 0
}

/** WHS Course Handicap = Index × (Slope ÷ 113) + (Course Rating − Par). */
export function courseHandicap(handicapIndex: number, tee: Tee): number {
  return roundHalfUp(handicapIndex * (tee.slope / 113) + (tee.courseRating - tee.par));
}

/** Playing Handicap = Course Handicap × allowance. */
export function playingHandicap(courseHcp: number, allowance: number): number {
  return roundHalfUp(courseHcp * allowance);
}

/**
 * Strokes received on a hole given its difficulty rank (1 = hardest).
 * Plus handicaps give strokes back starting on the easiest hole.
 */
export function strokesOnHole(handicap: number, rank: number, holeCount = 18): number {
  if (handicap === 0) return 0;
  const n = Math.abs(handicap);
  const base = Math.floor(n / holeCount);
  const rem = n % holeCount;
  if (handicap > 0) return base + (rank <= rem ? 1 : 0);
  return -(base + (rank > holeCount - rem ? 1 : 0)) || 0;
}

/** Strokes received on each hole, in hole order. */
export function strokeAllocation(handicap: number, holes: Hole[]): number[] {
  const order = holes
    .map((h, i) => ({ i, si: h.strokeIndex }))
    .sort((a, b) => a.si - b.si);
  const rank: number[] = new Array(holes.length);
  order.forEach((o, r) => (rank[o.i] = r + 1));
  return holes.map((_, i) => strokesOnHole(handicap, rank[i], holes.length));
}

/** Apply strokes-off-the-low-man (or leave full handicaps). */
export function adjustForMode(values: Record<string, number>, mode: HandicapMode): Record<string, number> {
  const out: Record<string, number> = {};
  const min = Math.min(...Object.values(values));
  for (const [k, v] of Object.entries(values)) out[k] = mode === 'offLow' ? v - min : v;
  return out;
}

/** Alternate shot (foursomes): allowance (default 50%) of the partners' combined course handicaps. */
export function foursomesTeamHandicap(courseHcps: number[], allowance = 0.5): number {
  return roundHalfUp(courseHcps.reduce((s, c) => s + c, 0) * allowance);
}

/**
 * Scramble team handicap: lowest course handicap gets the first percentage,
 * next lowest the second, and so on. 2- and 4-player defaults follow WHS
 * recommendations; the 3-player default is a common convention.
 */
export const SCRAMBLE_PERCENTAGES: Record<number, number[]> = {
  2: [0.35, 0.15],
  3: [0.3, 0.2, 0.1],
  4: [0.25, 0.2, 0.15, 0.1],
};

export function scrambleTeamHandicap(courseHcps: number[], percentages?: number[]): number {
  const pct = percentages ?? SCRAMBLE_PERCENTAGES[courseHcps.length];
  if (!pct || pct.length !== courseHcps.length) {
    throw new Error(`No scramble percentages for a ${courseHcps.length}-player team`);
  }
  const sorted = [...courseHcps].sort((a, b) => a - b);
  return roundHalfUp(sorted.reduce((s, c, i) => s + c * pct[i], 0));
}

/**
 * Default handicap allowances (WHS Appendix C recommendations where they exist).
 * Every game lets the organizer override these.
 */
export const DEFAULT_ALLOWANCES = {
  singlesMatch: 1.0,
  fourBallMatch: 0.9,
  foursomes: 0.5,
  strokePlay: 0.95,
  fourBallStroke: 0.85,
  stableford: 0.95,
  skins: 1.0,
  wolf: 1.0,
  vegas: 1.0,
  shamble: 0.85,
} as const;
