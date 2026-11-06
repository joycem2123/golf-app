import { describe, expect, it } from 'vitest';

import { evaluateGame, holeOrder, type GameConfig } from '../src';
import { COURSE, PARS, players } from './fixtures';

const round = (scores: Record<string, (number | null)[]>, spec: Record<string, number> = { a: 0, b: 10 }) => ({ course: COURSE, players: players(spec), scores });
const singles = (play?: GameConfig['play']): GameConfig => ({ type: 'matchPlay', format: 'singles', sideA: { id: 'a', members: ['a'] }, sideB: { id: 'b', members: ['b'] }, play });
const blank = () => new Array(18).fill(null) as (number | null)[];

describe('hole order', () => {
  it('handles 18 from 1, 18 from 10 (wraps), 9 from 10 and a custom 9', () => {
    expect(holeOrder({ holes: 18, start: 1 })).toEqual([...Array(18)].map((_, i) => i + 1));
    expect(holeOrder({ holes: 18, start: 10 })).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(holeOrder({ holes: 9, start: 10 })).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(holeOrder({ holes: 9, start: 14 })).toEqual([14, 15, 16, 17, 18, 1, 2, 3, 4]);
  });
});

describe('9-hole matches', () => {
  it('halves the handicap and only uses the nine holes played', () => {
    // b is a 10: 5 strokes over nine holes, on the 5 hardest of holes 10-18.
    const a = blank();
    const b = blank();
    for (let n = 10; n <= 18; n++) {
      a[n - 1] = PARS[n - 1];
      b[n - 1] = PARS[n - 1];
    }
    const res = evaluateGame(round({ a, b }), singles({ holes: 9, start: 10 }));
    if (res.type !== 'matchPlay') throw new Error('wrong type');
    expect(res.finished).toBe(true);
    expect(res.status.holesInMatch).toBe(9);
    const strokes = res.strokes.b;
    expect(strokes.slice(0, 9).every((s) => s === 0)).toBe(true); // front nine not played
    expect(strokes.reduce((s, x) => s + x, 0)).toBe(5);
    // Hardest back-nine holes by stroke index: 13 (2), 15 (4), 18 (6), 10 (8), 12 (10).
    for (const n of [13, 15, 18, 10, 12]) expect(strokes[n - 1]).toBe(1);
    expect(res.winnerIds).toEqual(['b']); // won 5 holes with strokes
    expect(res.status.outcomes[0]).toBeNull();
    expect(res.status.outcomes[12]).toBe(-1); // hole 13 won by b
    expect(res.holeOrder).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });
});

describe('starting on hole 10', () => {
  it('closes out in playing order (10..18 then 1..9)', () => {
    // Even players. b wins holes 10-18, a wins hole 1, everything else halved.
    const a = [...PARS];
    const b = [...PARS];
    for (let n = 10; n <= 18; n++) a[n - 1] = PARS[n - 1] + 1;
    b[0] = PARS[0] + 1;
    const fromTen = evaluateGame(round({ a, b }, { a: 0, b: 0 }), singles({ holes: 18, start: 10 }));
    const fromOne = evaluateGame(round({ a, b }, { a: 0, b: 0 }), singles());
    if (fromTen.type !== 'matchPlay' || fromOne.type !== 'matchPlay') throw new Error('wrong type');
    // From 10: b is 9 up after 9, a wins hole 1 (8 up, 8 left), halve hole 2 → 8&7.
    expect(fromTen.status.display).toBe('8&7');
    // From 1: a is 1 up after 9, b wins 10-15 → 5 up with 3 left → 5&3.
    expect(fromOne.status.display).toBe('5&3');
  });

  it('Nassau front/back are the first and second nines played', () => {
    const a = [...PARS];
    const b = [...PARS];
    b[9] = PARS[9] + 1; // a wins hole 10 → the "front" (first nine played)
    b[0] = PARS[0] + 1; // ...and hole 1 → the "back" (second nine played)
    const game: GameConfig = { type: 'nassau', format: 'singles', sideA: { id: 'a', members: ['a'] }, sideB: { id: 'b', members: ['b'] }, play: { holes: 18, start: 10 } };
    const res = evaluateGame(round({ a, b }, { a: 0, b: 0 }), game);
    if (res.type !== 'nassau') throw new Error('wrong type');
    expect(res.segments.map((s) => s.awardedTo)).toEqual(['A', 'A', 'A']);
    expect(res.points).toEqual({ A: 3, B: 0 });
  });
});
