import { describe, expect, it } from 'vitest';
import { playNassau } from '../src';
import { parCard, round } from './fixtures';

const A = { id: 'A', members: ['a1', 'a2'] };
const B = { id: 'B', members: ['b1', 'b2'] };
const scratch = { a1: 0, a2: 0, b1: 0, b2: 0 };

describe('Nassau on team formats (9 / 9 / 18, 1 point each)', () => {
  it('scramble: A wins the front, B wins the back, the 18 is halved', () => {
    const r = round(scratch, { A: parCard({ 1: 3 }), B: parCard({ 12: 4 }) });
    const res = playNassau(r, { type: 'nassau', format: 'scramble', sideA: A, sideB: B });
    expect(res.segments.map((s) => s.awardedTo)).toEqual(['A', 'B', null]);
    expect(res.points).toEqual({ A: 1.5, B: 1.5 });
    expect(res.finished).toBe(true);
  });

  it('shamble: best ball per hole decides each hole, A sweeps 3-0', () => {
    const r = round(scratch, { a1: parCard({ 2: 3 }), a2: parCard({ 14: 3 }), b1: parCard(), b2: parCard() });
    const res = playNassau(r, { type: 'nassau', format: 'shamble', sideA: A, sideB: B, handicap: { net: false } });
    expect(res.points).toEqual({ A: 3, B: 0 });
    expect(res.summary).toBe('A1 & A2 win the Nassau 3-0');
  });

  it('alternate shot (foursomes): the team card is keyed by side id', () => {
    const r = round(scratch, { A: parCard({ 5: 6 }), B: parCard() });
    const res = playNassau(r, { type: 'nassau', format: 'foursomes', sideA: A, sideB: B });
    expect(res.segments.map((s) => s.awardedTo)).toEqual(['B', null, 'B']);
    expect(res.points).toEqual({ A: 0.5, B: 2.5 });
  });
});
