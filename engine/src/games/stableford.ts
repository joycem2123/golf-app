import { DEFAULT_ALLOWANCES } from '../handicap';
import { bestNSum, consecutiveThru, individualBook, rankStandings, settingsWith, sideName } from '../scoring';
import type { BaseResult, HandicapSettings, Round, Side } from '../types';

/** Points by score relative to par. Anything better than eagle scores `albatross`. */
export interface StablefordTable {
  albatross: number;
  eagle: number;
  birdie: number;
  par: number;
  bogey: number;
  doubleBogeyOrWorse: number;
}

export const STABLEFORD_STANDARD: StablefordTable = {
  albatross: 5,
  eagle: 4,
  birdie: 3,
  par: 2,
  bogey: 1,
  doubleBogeyOrWorse: 0,
};

/** Modified Stableford (PGA Tour style). */
export const STABLEFORD_MODIFIED: StablefordTable = {
  albatross: 8,
  eagle: 5,
  birdie: 2,
  par: 0,
  bogey: -1,
  doubleBogeyOrWorse: -3,
};

export function stablefordPoints(score: number, par: number, table: StablefordTable): number {
  const d = score - par;
  if (d <= -3) return table.albatross;
  if (d === -2) return table.eagle;
  if (d === -1) return table.birdie;
  if (d === 0) return table.par;
  if (d === 1) return table.bogey;
  return table.doubleBogeyOrWorse;
}

export interface StablefordConfig {
  type: 'stableford';
  id?: string;
  title?: string;
  /** 'standard', 'modified', or a custom points table. */
  system?: 'standard' | 'modified' | StablefordTable;
  /** Individual entries... */
  playerIds?: string[];
  /** ...or teams, counting the best `countBest` members' points on each hole. */
  teams?: Side[];
  countBest?: number;
  handicap?: Partial<HandicapSettings>;
}

export interface StablefordResult extends BaseResult {
  type: 'stableford';
  /** Points per entry per hole (null = not complete). */
  holePoints: Record<string, (number | null)[]>;
  totals: Record<string, number>;
}

export function playStableford(round: Round, cfg: StablefordConfig): StablefordResult {
  const settings = settingsWith({ allowance: DEFAULT_ALLOWANCES.stableford, mode: 'offLow', net: true }, cfg.handicap);
  const table =
    cfg.system === 'modified' ? STABLEFORD_MODIFIED : typeof cfg.system === 'object' ? cfg.system : STABLEFORD_STANDARD;
  const entries: Side[] = cfg.teams ?? (cfg.playerIds ?? []).map((id) => ({ id, members: [id] }));
  if (entries.length === 0) throw new Error('Stableford needs players or teams');
  const playerIds = entries.flatMap((e) => e.members);
  const { book } = individualBook(round, playerIds, settings);
  const countBest = cfg.countBest ?? 1;

  const pointsFor = (id: string, i: number) => {
    const s = book.score(id, i, settings.net);
    return s === null ? null : stablefordPoints(s, book.par(id, i), table);
  };

  const holePoints: Record<string, (number | null)[]> = {};
  const totals: Record<string, number> = {};
  for (const e of entries) {
    // Higher is better, so take the best N by negating into bestNSum (which takes lowest).
    holePoints[e.id] = Array.from({ length: book.holeCount }, (_, i) => {
      const pts = e.members.map((m) => pointsFor(m, i));
      const neg = bestNSum(pts.map((p) => (p === null ? null : -p)), Math.min(countBest, e.members.length));
      return neg === null ? null : -neg || 0;
    });
    totals[e.id] = holePoints[e.id].reduce<number>((s, p) => s + (p ?? 0), 0);
  }

  const thruOf = (id: string) => consecutiveThru((i) => holePoints[id][i] !== null, book.holeCount);
  const standings = rankStandings(
    entries.map((e) => ({ id: e.id, name: sideName(round, e), value: totals[e.id], thru: thruOf(e.id) })),
    'high',
  );
  const thru = Math.min(...entries.map((e) => thruOf(e.id)));
  const finished = thru === book.holeCount;
  const leaders = standings.filter((s) => s.position === 1);
  const summary =
    thru === 0 && leaders[0].value === 0
      ? 'Not started'
      : `${leaders.map((l) => l.name).join(' & ')} ${finished ? (leaders.length > 1 ? 'tie' : 'wins') : 'leads'} with ${leaders[0].value} pts`;

  return {
    type: 'stableford',
    title: cfg.title ?? `${cfg.system === 'modified' ? 'Modified ' : ''}Stableford`,
    finished,
    thru,
    winnerIds: finished ? leaders.map((l) => l.id) : [],
    summary,
    postingEligible: true,
    standings,
    holePoints,
    totals,
  };
}
