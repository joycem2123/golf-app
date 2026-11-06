import { describe, expect, it } from 'vitest';
import { courseHandicap, findCourse, ScoreBook, searchCourses, SEED_COURSES, validateCourse } from '../src';
import { COURSE } from './fixtures';

describe('seed courses', () => {
  it.each(SEED_COURSES.map((c) => [c.name, c] as const))('%s has valid data', (_, course) => {
    expect(validateCourse(course)).toEqual([]);
  });

  it('includes Willow Park and both Indian Ridge courses', () => {
    expect(searchCourses('indian ridge').map((c) => c.id)).toEqual(['indian-ridge-arroyo', 'indian-ridge-grove']);
    expect(searchCourses('calgary')[0].id).toBe('willow-park');
  });

  it('Willow Park blue tees: course handicap for a 12.0 index', () => {
    const blue = findCourse('willow-park')!.tees.find((t) => t.id === 'blue')!;
    // 12.0 × 130/113 + (70.6 − 71) = 13.405 → 13
    expect(courseHandicap(12.0, blue)).toBe(13);
  });

  it('uses each tee’s own stroke index (Arroyo Gold vs Blue differ)', () => {
    const arroyo = findCourse('indian-ridge-arroyo')!;
    const r = { course: arroyo, players: [], scores: {} };
    const book = new ScoreBook(r, [
      { key: 'gold', teeId: 'gold', handicap: 1 },
      { key: 'blue', teeId: 'blue', handicap: 1 },
    ]);
    const strokeHole = (key: string) => arroyo.tees[0].holes.findIndex((_, i) => book.strokesReceived(key, i) === 1) + 1;
    // Gold: stroke index 1 is hole 2. Blue: stroke index 1 is hole 6.
    expect(strokeHole('gold')).toBe(2);
    expect(strokeHole('blue')).toBe(6);
  });

  it('flags bad data', () => {
    const bad = structuredClone(COURSE);
    bad.tees[0].holes[1].strokeIndex = 7; // duplicate of hole 1
    expect(validateCourse(bad)[0]).toMatch(/no repeats/);
  });
});

describe('course history', () => {
  it('rounds played before a scorecard change keep the old card', async () => {
    const { courseAsOf, findCourse } = await import('../src');
    const old = courseAsOf('willow-park', Date.UTC(2026, 9, 1));
    expect(old?.tees.map((t) => t.id)).not.toContain('black');
    expect(old?.tees[0].holes[0].strokeIndex).toBe(3);
    expect(courseAsOf('willow-park', Date.now())).toBeUndefined();
    expect(findCourse('willow-park')?.tees.map((t) => t.name)).toEqual(['Black', 'Blue', 'White', 'Gold', 'Silver', 'White', 'Gold']);
  });
});
