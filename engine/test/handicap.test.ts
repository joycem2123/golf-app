import { describe, expect, it } from 'vitest';
import {
  adjustForMode,
  courseHandicap,
  foursomesTeamHandicap,
  playingHandicap,
  scoreMatch,
  scrambleTeamHandicap,
  strokeAllocation,
  strokesOnHole,
} from '../src';
import { COURSE } from './fixtures';

const blue = COURSE.tees[1];
const neutral = COURSE.tees[0];

describe('WHS handicaps', () => {
  it('course handicap = index × slope/113 + (rating − par)', () => {
    // 12.4 × 131/113 − 0.8 = 13.575 → 14
    expect(courseHandicap(12.4, blue)).toBe(14);
    expect(courseHandicap(-1.2, neutral)).toBe(-1);
    expect(courseHandicap(0, blue)).toBe(-1);
  });

  it('playing handicap applies the allowance', () => {
    expect(playingHandicap(18, 0.95)).toBe(17); // 17.1
    expect(playingHandicap(15, 0.9)).toBe(14); // 13.5 rounds up
    expect(playingHandicap(-3, 0.5)).toBe(-1); // -1.5 rounds up to -1
  });

  it('strokes go to the hardest holes first, plus handicaps give back on the easiest', () => {
    expect(strokesOnHole(20, 1)).toBe(2);
    expect(strokesOnHole(20, 2)).toBe(2);
    expect(strokesOnHole(20, 3)).toBe(1);
    expect(strokesOnHole(20, 18)).toBe(1);
    expect(strokesOnHole(-2, 18)).toBe(-1);
    expect(strokesOnHole(-2, 17)).toBe(-1);
    expect(strokesOnHole(-2, 16)).toBe(0);
  });

  it('allocation across the card always adds up to the handicap', () => {
    for (const h of [0, 5, 18, 20, 36, 40, -2]) {
      expect(strokeAllocation(h, neutral.holes).reduce((a, b) => a + b, 0)).toBe(h);
    }
    // 1 stroke goes to stroke index 1 = hole 2
    expect(strokeAllocation(1, neutral.holes)[1]).toBe(1);
  });

  it('strokes off the low man', () => {
    expect(adjustForMode({ a: 12, b: 4, c: 20 }, 'offLow')).toEqual({ a: 8, b: 0, c: 16 });
    expect(adjustForMode({ a: 12, b: 4 }, 'full')).toEqual({ a: 12, b: 4 });
  });

  it('team handicaps', () => {
    expect(foursomesTeamHandicap([9, 14])).toBe(12); // 11.5
    expect(scrambleTeamHandicap([22, 4, 16, 10])).toBe(8); // 1 + 2 + 2.4 + 2.2 = 7.6
    expect(scrambleTeamHandicap([10, 20])).toBe(7); // 3.5 + 3 = 6.5
  });
});

describe('match play status', () => {
  it('closes out early (4&3)', () => {
    const o = [1, 1, 1, 1, ...new Array(11).fill(0), ...new Array(3).fill(null)] as (1 | 0 | null)[];
    const s = scoreMatch(o);
    expect(s.finished).toBe(true);
    expect(s.display).toBe('4&3');
    expect(s.closedOutOnHole).toBe(15);
  });

  it('in progress, dormie, and finishing on 18', () => {
    const o: (1 | 0 | -1 | null)[] = [1, 1, ...new Array(14).fill(0), null, null];
    const s = scoreMatch(o);
    expect(s.display).toBe('2 UP thru 16');
    expect(s.dormie).toBe(true);
    expect(scoreMatch([...o.slice(0, 16), -1, 0] as any).display).toBe('1 UP');
    expect(scoreMatch(new Array(18).fill(0)).winner).toBe('halved');
  });
});
