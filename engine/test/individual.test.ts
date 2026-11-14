import { describe, expect, it } from 'vitest';
import { individualStandings, placePoints, type IndividualItem } from '../src';

describe('individual season points', () => {
  it('place points: 1st 1, 2nd ½, ties share the places they cover', () => {
    expect(placePoints({ a: 1, b: 2, c: 3 }, [1, 0.5])).toEqual({
      a: { place: 1, tied: false, points: 1 },
      b: { place: 2, tied: false, points: 0.5 },
      c: { place: 3, tied: false, points: 0 },
    });
    const tie = placePoints({ a: 1, b: 1, c: 3 }, [1, 0.5]);
    expect(tie.a.points).toBe(0.75);
    expect(tie.c.points).toBe(0);
    expect(placePoints({ a: 1, b: 2, c: 2, d: 2 }, [1, 0.5]).b.points).toBe(0.17);
  });

  it('partners each get the side’s Nassau points; totals add up across formats', () => {
    const m = (roundId: string, points: number, result: IndividualItem['result']): IndividualItem => ({ roundId, game: 'Nassau', kind: 'match', result, detail: '', points });
    const p = (roundId: string, place: number, points: number): IndividualItem => ({ roundId, game: 'Stroke Play', kind: 'place', result: null, place, detail: '', points });
    const rows = individualStandings(
      { matt: [m('r1', 2.5, 'won'), p('r2', 2, 0.5)], braydon: [m('r1', 2.5, 'won'), p('r2', 1, 1)], dave: [m('r1', 0.5, 'lost')] },
      ['matt', 'braydon', 'dave', 'jacob'],
    );
    expect(rows.map((r) => [r.playerId, r.points, r.position])).toEqual([
      ['braydon', 3.5, 1],
      ['matt', 3, 2],
      ['dave', 0.5, 3],
      ['jacob', 0, 4],
    ]);
    expect(rows[0]).toMatchObject({ matchPoints: 2.5, placePoints: 1, rounds: 2, wins: 1, firsts: 1 });
  });
});
