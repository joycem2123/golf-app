import { describe, expect, it } from 'vitest';
import {
  playScramble,
  playShamble,
  playSkins,
  playStableford,
  playStrokePlay,
  playVegas,
  playWolf,
  postingReminders,
  vegasNumber,
  type WolfDecision,
} from '../src';
import { card, parCard, round } from './fixtures';

describe('skins', () => {
  const gross = { net: false };

  it('carryovers on and off', () => {
    const scores = { a: parCard({ 1: 3 }), b: parCard({ 3: 2 }), c: parCard() };
    const r = round({ a: 0, b: 0, c: 0 }, scores);
    const carry = playSkins(r, { type: 'skins', playerIds: ['a', 'b', 'c'], handicap: gross });
    expect(carry.skins).toEqual({ a: 1, b: 2, c: 0 });
    expect(carry.unclaimed).toBe(15);
    expect(carry.summary).toBe('B wins with 2 skins');

    const noCarry = playSkins(r, { type: 'skins', playerIds: ['a', 'b', 'c'], carryovers: false, handicap: gross });
    expect(noCarry.skins).toEqual({ a: 1, b: 1, c: 0 });
  });

  it('validation: winner must tie or beat the field on the next hole', () => {
    const r = round(
      { a: 0, b: 0, c: 0 },
      { a: parCard({ 1: 3, 2: 5 }), b: parCard(), c: parCard({ 3: 2 }) },
    );
    const res = playSkins(r, { type: 'skins', playerIds: ['a', 'b', 'c'], validation: 'tieOrBetter', handicap: gross });
    expect(res.holes[0].status).toBe('notValidated');
    expect(res.holes[2]).toMatchObject({ status: 'won', winnerId: 'c', value: 3 });
    expect(res.skins).toEqual({ a: 0, b: 0, c: 3 });
  });

  it('validation: par or better on the next hole', () => {
    const r = round({ a: 0, b: 0 }, { a: card([3, 5]), b: card([4, 4]) });
    const res = playSkins(r, { type: 'skins', playerIds: ['a', 'b'], validation: 'parOrBetter', handicap: gross });
    expect(res.holes[0].status).toBe('notValidated');
  });

  it('net skins use strokes off the low man', () => {
    const r = round({ a: 18, b: 0 }, { a: parCard(), b: parCard() });
    expect(playSkins(r, { type: 'skins', playerIds: ['a', 'b'] }).skins.a).toBe(18);
  });
});

describe('wolf', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('4 players: partner, lone, blind wolf and tie carryover', () => {
    const decisions: WolfDecision[] = [
      { mode: 'partner', partnerId: 'b' }, // h1 wolf a
      { mode: 'lone' }, // h2 wolf b
      { mode: 'blind' }, // h3 wolf c
      { mode: 'partner', partnerId: 'a' }, // h4 wolf d (tie)
      { mode: 'partner', partnerId: 'c' }, // h5 wolf a, worth double
    ];
    const r = round(
      { a: 0, b: 0, c: 0, d: 0 },
      {
        a: card([3, 4, 4, 4, 4]),
        b: card([4, 3, 4, 4, 4]),
        c: card([4, 4, 5, 4, 4]),
        d: card([4, 4, 4, 4, 3]),
      },
    );
    const res = playWolf(r, { type: 'wolf', order: ids, decisions, ties: 'carryover', handicap: { net: false } });
    expect(res.holes.slice(0, 5).map((h) => h.wolfId)).toEqual(['a', 'b', 'c', 'd', 'a']);
    expect(res.holes[4].multiplier).toBe(2);
    expect(res.points).toEqual({ a: 4, b: 14, c: 0, d: 8 });
    expect(res.nextWolfId).toBe('b');
    expect(res.summary).toBe('B leads with 14 pts');
  });

  it('4 players: last-place player is the wolf on 17 and 18', () => {
    const decisions = new Array(16).fill({ mode: 'partner', partnerId: 'x' }).map((_, i) => ({
      mode: 'partner' as const,
      partnerId: ids[(i + 1) % 4],
    }));
    // a wins hole 1 with partner b; everything else tied, so c and d are tied last; c is earlier in order.
    const r = round(
      { a: 0, b: 0, c: 0, d: 0 },
      { a: parCard({ 1: 3 }), b: parCard(), c: parCard(), d: parCard() },
    );
    const res = playWolf(r, { type: 'wolf', order: ids, decisions, handicap: { net: false } });
    expect(res.thru).toBe(16);
    expect(res.nextWolfId).toBe('c');
    const rotating = playWolf(r, { type: 'wolf', order: ids, decisions, lastHoles: 'rotation', handicap: { net: false } });
    expect(rotating.nextWolfId).toBe('a');
  });

  it('3 players rotate evenly', () => {
    const r = round({ a: 0, b: 0, c: 0 }, { a: card([4]), b: card([4]), c: card([3]) });
    const res = playWolf(r, {
      type: 'wolf',
      order: ['a', 'b', 'c'],
      decisions: [{ mode: 'partner', partnerId: 'b' }],
      handicap: { net: false },
    });
    expect(res.points).toEqual({ a: 0, b: 0, c: 3 });
    expect(res.nextWolfId).toBe('b');
  });

  it('rejects 5 players', () => {
    const r = round({ a: 0, b: 0, c: 0, d: 0, e: 0 }, {});
    expect(() => playWolf(r, { type: 'wolf', order: ['a', 'b', 'c', 'd', 'e'], decisions: [] })).toThrow();
  });
});

describe('vegas', () => {
  it('builds team numbers', () => {
    expect(vegasNumber([5, 4], false, 'highFirst')).toBe(45);
    expect(vegasNumber([5, 4], true, 'highFirst')).toBe(54);
    expect(vegasNumber([4, 10], false, 'highFirst')).toBe(104);
    expect(vegasNumber([4, 10], false, 'standard')).toBe(410);
  });

  it('birdie flips the other team and 10+ goes first', () => {
    const scores = { a: card([4, 3, 3]), b: card([5, 5, 10]), c: card([4, 4, 3]), d: card([6, 5, 4]) };
    const r = round({ a: 0, b: 0, c: 0, d: 0 }, scores);
    const cfg = {
      type: 'vegas' as const,
      teamA: { id: 'A', name: 'Team A', members: ['a', 'b'] as [string, string] },
      teamB: { id: 'B', name: 'Team B', members: ['c', 'd'] as [string, string] },
      handicap: { net: false },
    };
    const res = playVegas(r, cfg);
    expect(res.holes.map((h) => h.pointsA)).toEqual([1, 19, -69]);
    expect(res.holes[1].flipped).toBe('B');
    expect(res.summary).toBe('Team B leads by 49 pts');
    expect(playVegas(r, { ...cfg, tenPlusRule: 'standard' }).totalA).toBe(1 + 19 - 276);
  });
});

describe('stableford', () => {
  const r = round({ a: 0, b: 0 }, { a: card([3, 4, 6]), b: card([5, 4, 3]) });

  it('standard and modified points', () => {
    expect(playStableford(r, { type: 'stableford', playerIds: ['a'] }).totals.a).toBe(3 + 2 + 0);
    expect(playStableford(r, { type: 'stableford', playerIds: ['a'], system: 'modified' }).totals.a).toBe(2 + 0 - 3);
  });

  it('team best ball of 2 counts the best points on each hole', () => {
    const res = playStableford(r, { type: 'stableford', teams: [{ id: 'T', members: ['a', 'b'] }], countBest: 1 });
    expect(res.totals.T).toBe(3 + 2 + 2);
  });

  it('net points use 95% allowance', () => {
    const net = round({ a: 18, b: 0 }, { a: card([4, 4]), b: card([4, 4]) });
    const res = playStableford(net, { type: 'stableford', playerIds: ['a', 'b'] });
    // a: PH 17 → stroke on every hole except SI 18; both opening holes are net birdies
    expect(res.totals.a).toBe(6);
    expect(res.summary).toBe('A leads with 6 pts');
  });
});

describe('team stroke formats', () => {
  it('scramble uses team handicap percentages and is not postable', () => {
    const r = round(
      { a1: 4, a2: 10, a3: 16, a4: 22, b1: 0, b2: 0, b3: 0, b4: 0 },
      { A: parCard(), B: parCard({ 1: 3 }) },
    );
    const res = playScramble(r, {
      type: 'scramble',
      teams: [
        { id: 'A', name: 'Team A', members: ['a1', 'a2', 'a3', 'a4'] },
        { id: 'B', name: 'Team B', members: ['b1', 'b2', 'b3', 'b4'] },
      ],
    });
    expect(res.totals.A).toMatchObject({ handicap: 8, toPar: -8, gross: 72 });
    expect(res.totals.B.toPar).toBe(-1);
    expect(res.summary).toBe('Team A wins at -8');
    expect(res.postingEligible).toBe(false);
  });

  it('shamble counts the best ball per hole', () => {
    const r = round(
      { a1: 0, a2: 0, b1: 0, b2: 0 },
      { a1: parCard({ 1: 3 }), a2: parCard({ 2: 3 }), b1: parCard(), b2: parCard() },
    );
    const res = playShamble(r, {
      type: 'shamble',
      teams: [{ id: 'A', members: ['a1', 'a2'] }, { id: 'B', members: ['b1', 'b2'] }],
    });
    expect(res.totals.A.toPar).toBe(-2);
    expect(res.winnerIds).toEqual(['A']);
  });

  it('individual stroke play', () => {
    const r = round({ a: 10, b: 0 }, { a: card([5, 5]), b: card([4, 4]) });
    const res = playStrokePlay(r, { type: 'strokePlay', playerIds: ['a', 'b'] });
    expect(res.totals.a).toMatchObject({ thru: 2, gross: 10, net: 8, toPar: 0 });
  });
});

describe('posting reminders', () => {
  it('only for formats where each player hits every shot', () => {
    const ids = postingReminders([
      { type: 'scramble', teams: [{ id: 'T', members: ['x', 'y'] }] },
      { type: 'skins', playerIds: ['a', 'b'] },
      { type: 'matchPlay', format: 'foursomes', sideA: { id: 'A', members: ['c', 'd'] }, sideB: { id: 'B', members: ['e', 'f'] } },
    ]);
    expect(ids.sort()).toEqual(['a', 'b']);
  });
});
