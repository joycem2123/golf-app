import { describe, expect, it } from 'vitest';
import {
  applyLockedHandicaps,
  applyScoreEntry,
  cupStandings,
  headToHead,
  ledgerToScorecard,
  lockHandicaps,
  randomizePairings,
  seasonStandings,
  summarizeStats,
  type CupMatch,
  type RecordedMatch,
} from '../src';
import { COURSE, players } from './fixtures';

describe('event handicap lock', () => {
  it('uses the index from the start of the event', () => {
    const locked = lockHandicaps(players({ a: 10.2 }));
    const later = [{ ...players({ a: 8.1 })[0] }];
    expect(applyLockedHandicaps(later, locked)[0].handicapIndex).toBe(10.2);
  });
});

describe('Ryder Cup style', () => {
  const m = (id: string, result: CupMatch['result']): CupMatch => ({ id, sideA: [], sideB: [], result });

  it('team passing half the points wins, even with matches left', () => {
    const s = cupStandings([m('1', 'A'), m('2', 'A'), m('3', 'halved'), m('4', null)]);
    expect(s).toMatchObject({ teamA: 2.5, teamB: 0.5, toWin: 2.5, winner: 'A', remainingPoints: 1 });
  });

  it('holder retains on a tie', () => {
    const s = cupStandings([m('1', 'A'), m('2', 'B')], { holder: 'B' });
    expect(s).toMatchObject({ winner: 'tied', retainedBy: 'B' });
    expect(cupStandings([m('1', 'A'), m('2', 'B')]).winner).toBe('tied');
  });

  it('live projection counts in-progress leaders', () => {
    const s = cupStandings([m('1', 'A'), m('2', null)], { liveLeaders: { '2': 'B' } });
    expect(s.projected).toEqual({ teamA: 1, teamB: 1 });
  });

  it('randomize pairings', () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const { pairings, unpaired } = randomizePairings(['a1', 'a2', 'a3', 'a4', 'a5'], ['b1', 'b2', 'b3', 'b4'], 2, rng);
    expect(pairings).toHaveLength(2);
    expect(pairings.every((p) => p.sideA.length === 2 && p.sideB.length === 2)).toBe(true);
    expect(unpaired).toHaveLength(1);
    const used = [...pairings.flatMap((p) => [...p.sideA, ...p.sideB]), ...unpaired];
    expect(new Set(used).size).toBe(9);
  });
});

describe('history', () => {
  const matches: RecordedMatch[] = [
    { id: '1', date: '2026-06-01', format: 'singles', sideA: ['mike'], sideB: ['dave'], result: 'A' },
    { id: '2', date: '2026-06-08', format: 'singles', sideA: ['dave'], sideB: ['mike'], result: 'halved' },
    { id: '3', date: '2026-06-15', format: 'fourBall', sideA: ['mike', 'sam'], sideB: ['dave', 'joe'], result: 'B' },
    { id: '4', date: '2026-06-22', format: 'fourBall', sideA: ['mike', 'dave'], sideB: ['sam', 'joe'], result: 'A' },
  ];

  it('season standings', () => {
    const s = seasonStandings(matches);
    // mike and dave are tied on 2.5 points; joe has 1 win, sam lost both
    expect(s.find((r) => r.playerId === 'dave')).toMatchObject({ points: 2.5, wins: 2, halves: 1, position: 1 });
    expect(s.find((r) => r.playerId === 'mike')).toMatchObject({ points: 2.5, wins: 2, position: 1 });
    expect(s.find((r) => r.playerId === 'joe')).toMatchObject({ points: 1, position: 3 });
    expect(s.find((r) => r.playerId === 'sam')).toMatchObject({ points: 0, position: 4 });
  });

  it('head to head', () => {
    const h = headToHead(matches, 'mike', 'dave');
    expect(h.overall).toEqual({ wins: 1, losses: 1, halves: 1 });
    expect(h.singles).toEqual({ wins: 1, losses: 0, halves: 1 });
    expect(h.team).toEqual({ wins: 0, losses: 1, halves: 0 });
    expect(h.asPartners).toEqual({ wins: 1, losses: 0, halves: 0 });
  });
});

describe('score sync', () => {
  const e = (gross: number, by: string, at: number) => ({ key: 'mike', hole: 3, gross, enteredBy: by, enteredAt: at });

  it('latest entry wins and the group is notified of the change', () => {
    let { ledger } = applyScoreEntry({}, e(4, 'mike', 100));
    const res = applyScoreEntry(ledger, e(5, 'dave', 200));
    expect(res.ledger['mike#3'].gross).toBe(5);
    expect(res.notice).toMatchObject({ keptGross: 5, replacedGross: 4, keptBy: 'dave', replacedBy: 'mike' });
    ledger = res.ledger;
    expect(ledgerToScorecard(ledger, ['mike'])['mike'][2]).toBe(5);
  });

  it('an older offline entry syncing late does not overwrite, but still notifies', () => {
    const { ledger } = applyScoreEntry({}, e(5, 'dave', 200));
    const res = applyScoreEntry(ledger, e(4, 'mike', 100));
    expect(res.ledger['mike#3'].gross).toBe(5);
    expect(res.notice).not.toBeNull();
  });

  it('no notice when someone corrects their own entry or the scores match', () => {
    const { ledger } = applyScoreEntry({}, e(4, 'mike', 100));
    expect(applyScoreEntry(ledger, e(5, 'mike', 200)).notice).toBeNull();
    expect(applyScoreEntry(ledger, e(4, 'dave', 200)).notice).toBeNull();
  });
});

describe('stats', () => {
  it('putts, fairways, greens in regulation, scoring', () => {
    const holes = COURSE.tees[0].holes.slice(0, 3); // par 4, 4, 3
    const s = summarizeStats(
      [4, 5, 2],
      [{ putts: 2, fairway: 'hit' }, { putts: 2, fairway: 'left' }, { putts: 1, fairway: 'hit' }],
      holes,
    );
    expect(s).toMatchObject({ putts: 5, fairwaysHit: 1, fairwayAttempts: 2, girHit: 2, girAttempts: 3 });
    expect(s.scoring).toMatchObject({ birdies: 1, pars: 1, bogeys: 1 });
  });
});
