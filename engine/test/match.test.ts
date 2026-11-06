import { describe, expect, it } from 'vitest';
import { playMatch, playNassau, singlesSideMatches, evaluateRound } from '../src';
import { card, parCard, round } from './fixtures';

describe('singles match play', () => {
  it('higher handicap gets strokes off the low man and wins 5&3 when both shoot par', () => {
    const r = round({ mike: 10, dave: 4 }, { mike: parCard(), dave: parCard() });
    const res = playMatch(r, {
      type: 'matchPlay',
      format: 'singles',
      sideA: { id: 'mike', members: ['mike'] },
      sideB: { id: 'dave', members: ['dave'] },
    });
    expect(res.handicaps.mike.matchHandicap).toBe(6);
    expect(res.handicaps.dave.matchHandicap).toBe(0);
    expect(res.summary).toBe('MIKE wins 5&3');
    expect(res.winnerIds).toEqual(['mike']);
    expect(res.postingEligible).toBe(true);
  });

  it('gross match ignores handicaps', () => {
    const r = round({ mike: 10, dave: 4 }, { mike: card([5, 4]), dave: card([4, 4]) });
    const res = playMatch(r, {
      type: 'matchPlay',
      format: 'singles',
      sideA: { id: 'mike', members: ['mike'] },
      sideB: { id: 'dave', members: ['dave'] },
      handicap: { net: false },
    });
    expect(res.summary).toBe('DAVE 1 UP thru 2');
    expect(res.finished).toBe(false);
  });
});

describe('best ball (four-ball) match play', () => {
  it('uses 90% allowance and best net ball', () => {
    const r = round(
      { a1: 10, a2: 20, b1: 0, b2: 0 },
      { a1: parCard(), a2: parCard(), b1: parCard(), b2: parCard() },
    );
    const res = playMatch(r, {
      type: 'matchPlay',
      format: 'fourBall',
      sideA: { id: 'A', name: 'Team A', members: ['a1', 'a2'] },
      sideB: { id: 'B', name: 'Team B', members: ['b1', 'b2'] },
    });
    expect(res.handicaps.a1.matchHandicap).toBe(9);
    expect(res.handicaps.a2.matchHandicap).toBe(18);
    // a2 gets a stroke on every hole, so Team A wins every hole: 10&8
    expect(res.summary).toBe('Team A wins 10&8');
  });
});

describe('alternate shot (foursomes)', () => {
  it('team handicap is 50% of combined course handicaps and the team plays one ball', () => {
    const r = round({ a1: 9, a2: 14, b1: 0, b2: 0 }, { A: parCard(), B: parCard() });
    const res = playMatch(r, {
      type: 'matchPlay',
      format: 'foursomes',
      sideA: { id: 'A', name: 'Team A', members: ['a1', 'a2'] },
      sideB: { id: 'B', name: 'Team B', members: ['b1', 'b2'] },
    });
    expect(res.handicaps.A.matchHandicap).toBe(12);
    expect(res.winnerIds).toEqual(['A']);
    expect(res.postingEligible).toBe(false);
  });
});

describe('side matches', () => {
  it('runs singles side matches alongside a main game', () => {
    const r = round(
      { a1: 0, a2: 0, b1: 0, b2: 0 },
      { a1: parCard({ 1: 3 }), a2: parCard(), b1: parCard(), b2: parCard({ 2: 3 }) },
    );
    const results = evaluateRound(r, [
      { type: 'matchPlay', format: 'fourBall', sideA: { id: 'A', members: ['a1', 'a2'] }, sideB: { id: 'B', members: ['b1', 'b2'] } },
      ...singlesSideMatches([['a1', 'b1'], ['a2', 'b2']]),
    ]);
    expect(results.map((x) => x.summary)).toEqual(['A1 & A2 and B1 & B2 halved', 'A1 wins 1 UP', 'B2 wins 1 UP']);
  });
});

describe('Nassau', () => {
  const sides = { sideA: { id: 'A', members: ['a'] }, sideB: { id: 'B', members: ['b'] } };

  it('front, back and overall; halved back carries to the overall', () => {
    const r = round({ a: 0, b: 0 }, { a: parCard({ 1: 3 }), b: parCard() });
    const withCarry = playNassau(r, { type: 'nassau', format: 'singles', ...sides, carryovers: true });
    expect(withCarry.segments.map((s) => s.status.display)).toEqual(['1 UP', 'Halved', '1 UP']);
    expect(withCarry.segments[1].carriedForward).toBe(true);
    expect(withCarry.points).toEqual({ A: 3, B: 0 });

    // Without carryovers a halved nine is split: front A, back halved, 18 A = 2½–½.
    const noCarry = playNassau(r, { type: 'nassau', format: 'singles', ...sides });
    expect(noCarry.points).toEqual({ A: 2.5, B: 0.5 });
    expect(noCarry.summary).toBe('A wins the Nassau 2½-½');
  });

  it('manual press runs to the end of its nine', () => {
    const r = round({ a: 0, b: 0 }, { a: parCard({ 1: 3 }), b: parCard({ 12: 4 }) });
    const res = playNassau(r, {
      type: 'nassau',
      format: 'singles',
      ...sides,
      presses: [{ segment: 'back', startHole: 12, pressedBy: 'B' }],
    });
    expect(res.presses[0].awardedTo).toBe('B');
    // front A 1, back B 1, press B 1, 18 halved ½ each
    expect(res.points).toEqual({ A: 1.5, B: 2.5 });
    expect(res.winnerIds).toEqual(['B']);
  });

  it('a halved 18 with carryovers is split instead of left hanging', () => {
    const r = round({ a: 0, b: 0 }, { a: parCard({ 1: 3 }), b: parCard({ 10: 3 }) });
    const res = playNassau(r, { type: 'nassau', format: 'singles', ...sides, carryovers: true });
    expect(res.points).toEqual({ A: 1.5, B: 1.5 });
    expect(res.summary).toBe('Nassau tied 1½-1½');
    expect(res.unresolvedCarry).toBe(0);
  });

  it('rejects a press outside its nine', () => {
    const r = round({ a: 0, b: 0 }, { a: parCard(), b: parCard() });
    expect(() =>
      playNassau(r, { type: 'nassau', format: 'singles', ...sides, presses: [{ segment: 'front', startHole: 12 }] }),
    ).toThrow();
  });
});

describe('best ball with bigger teams', () => {
  it('2 teams of 4: the best net ball of four counts', () => {
    const r = round(
      { a1: 0, a2: 0, a3: 0, a4: 0, b1: 0, b2: 0, b3: 0, b4: 0 },
      {
        a1: parCard(), a2: parCard(), a3: parCard(), a4: parCard({ 1: 3 }),
        b1: parCard(), b2: parCard(), b3: parCard(), b4: parCard(),
      },
    );
    const res = playMatch(r, {
      type: 'matchPlay',
      format: 'fourBall',
      sideA: { id: 'A', name: 'Team A', members: ['a1', 'a2', 'a3', 'a4'] },
      sideB: { id: 'B', name: 'Team B', members: ['b1', 'b2', 'b3', 'b4'] },
    });
    expect(res.status.outcomes[0]).toBe(1); // a4's birdie on hole 1 wins it
    expect(res.summary).toBe('Team A wins 1 UP');
  });

  it('still rejects 5-player sides', () => {
    const r = round({ a1: 0, a2: 0, a3: 0, a4: 0, a5: 0, b1: 0 }, {});
    expect(() =>
      playMatch(r, { type: 'matchPlay', format: 'fourBall', sideA: { id: 'A', members: ['a1', 'a2', 'a3', 'a4', 'a5'] }, sideB: { id: 'B', members: ['b1'] } }),
    ).toThrow();
  });
});

describe('match status with blank holes', () => {
  it('counts holes played after a blank one (a group that started elsewhere)', async () => {
    const { scoreMatch } = await import('../src/matchplay');
    const outcomes = [null, 1, 0, 1, ...Array(14).fill(null)] as (1 | 0 | -1 | null)[];
    const s = scoreMatch(outcomes);
    expect(s.thru).toBe(3);
    expect(s.lead).toBe(2);
    expect(s.display).toBe('2 UP thru 3');
    expect(s.finished).toBe(false);
  });
});
