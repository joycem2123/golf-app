import { describe, expect, it } from 'vitest';
import data from './fixtures-willow-park-2026.json';
import { defaultFedex, fedexRounds, fedexStandings, scoreRound, type FedexConfig } from '../src/fedex';

// The Willow Park 2026 season, from the league's workbook: 2nd half from Jul 25, best 7 / 7 / 15, 1st +12 … 12th +1.
const cfg: FedexConfig = defaultFedex('2026-07-25');
const rounds = data.rounds.map((r) => ({ id: r.id, date: r.date, points: r.points as unknown as Record<string, number> }));

describe('FedEx Cup Stableford', () => {
  it('matches every Cup points total in the workbook', () => {
    const results = fedexRounds(rounds, cfg);
    let checked = 0;
    for (const r of results) {
      const want = data.rounds.find((x) => x.id === r.round.id)!.cup as unknown as Record<string, number>;
      for (const row of r.rows) {
        expect(row.cup).toBeCloseTo(want[row.playerId], 6);
        checked++;
      }
    }
    expect(checked).toBe(300);
  });

  it('matches the workbook standings for each half and the season', () => {
    const results = fedexRounds(rounds, cfg);
    for (const [part, key] of [['first', 'h1'], ['second', 'h2'], ['season', 's']] as const) {
      const rows = fedexStandings(results, cfg, part);
      const want = data.expected[key] as unknown as Record<string, number>;
      for (const row of rows) expect(row.points).toBeCloseTo(want[row.playerId], 6);
    }
    const season = fedexStandings(results, cfg, 'season');
    expect(season.slice(0, 3).map((r) => r.playerId)).toEqual(['Joyce, Jim', 'White, Kelly', 'Geib, Jeff']);
    expect(season[0].points).toBe(689.5);
    expect(season[0].cutoff).toBe(42.5);
  });

  it('shares bonuses on ties, and gives nothing past the table', () => {
    const rows = scoreRound({ a: 40, b: 35, c: 35, d: 30 }, [12, 11, 10, 9]);
    expect(rows.find((r) => r.playerId === 'b')).toMatchObject({ place: 2, tied: true, bonus: 10.5, cup: 45.5 });
    expect(rows.find((r) => r.playerId === 'd')!.bonus).toBe(9);
    expect(scoreRound({ a: 1, b: 2 }, [5])[1]).toMatchObject({ playerId: 'a', bonus: 0 });
  });

  it('counts imported rounds (totals only) with the ones played in the app', () => {
    const half = Math.floor(rounds.length / 2);
    const r = fedexRounds(rounds.slice(half), { ...cfg, imported: rounds.slice(0, half) });
    expect(r.length).toBe(rounds.length);
    expect(r.filter((x) => x.round.imported).length).toBe(half);
    expect(fedexStandings(r, cfg, 'season')[0].points).toBe(689.5);
  });

  it('can split the halves by number of rounds', () => {
    const r = fedexRounds(rounds, { ...cfg, half: { kind: 'rounds', count: 10 } });
    expect(r.filter((x) => x.half === 1).length).toBe(10);
  });
});
