import type { Course, Player, Round } from '../src';

export const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 5, 4, 4, 4, 3, 5, 4];
export const SI = [7, 1, 17, 11, 3, 13, 15, 5, 9, 8, 16, 10, 2, 14, 4, 18, 12, 6];

/** Fictional test course. "neutral" tee: rating 72 / slope 113, so course handicap = index. */
export const COURSE: Course = {
  id: 'test-gc',
  name: 'Test Golf Club',
  country: 'CA',
  tees: [
    {
      id: 'neutral',
      name: 'White',
      courseRating: 72,
      slope: 113,
      par: 72,
      holes: PARS.map((par, i) => ({ number: i + 1, par, strokeIndex: SI[i] })),
    },
    {
      id: 'blue',
      name: 'Blue',
      courseRating: 71.2,
      slope: 131,
      par: 72,
      holes: PARS.map((par, i) => ({ number: i + 1, par, strokeIndex: SI[i] })),
    },
  ],
};

export function players(spec: Record<string, number>): Player[] {
  return Object.entries(spec).map(([id, handicapIndex]) => ({ id, name: id.toUpperCase(), handicapIndex, teeId: 'neutral' }));
}

/** Pad a partial list of hole scores out to 18 holes with nulls. */
export const card = (scores: number[]) => [...scores, ...new Array(18 - scores.length).fill(null)];

/** Par on every hole, with overrides: { holeNumber: score }. */
export const parCard = (overrides: Record<number, number> = {}) =>
  PARS.map((p, i) => overrides[i + 1] ?? p);

export function round(spec: Record<string, number>, scores: Record<string, (number | null)[]>): Round {
  return { course: COURSE, players: players(spec), scores };
}
