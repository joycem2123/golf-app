/**
 * Stableford Points Race seasons. Every round, each player's Cup points are their Stableford points plus a finishing
 * bonus for where they placed that day (by default 1st +12, 2nd +11 … 12th +1). Players who tie share the bonuses
 * of the places they cover (two tied for 3rd each get the average of 3rd's and 4th's bonus).
 *
 * The standings add up each player's best rounds: the best X in the 1st half, the best Y in the 2nd half, and the
 * best Z across the whole season. A tie on points goes to the better Xth (Yth, Zth) best round, then the average.
 */

export interface FedexConfig {
  /** Where the 2nd half starts: on a date (YYYY-MM-DD, that day included), or after a number of rounds. */
  half: { kind: 'date'; date: string } | { kind: 'rounds'; count: number };
  /** How many of each player's best rounds count. */
  best: { first: number; second: number; season: number };
  /** Finishing bonus by place: bonus[0] for 1st, bonus[1] for 2nd… Places past the end get nothing. */
  bonus: number[];
  /** Stableford points table for every round. */
  system: 'standard' | 'modified';
  /** Rounds brought in from before the season was in the app (e.g. a league spreadsheet): totals only. */
  imported?: FedexRound[];
}

/** 1st +12, 2nd +11 … 12th +1 (the Willow Park bonus). */
export const DEFAULT_FEDEX_BONUS = Array.from({ length: 12 }, (_, i) => 12 - i);

export const defaultFedex = (halfDate: string): FedexConfig => ({
  half: { kind: 'date', date: halfDate },
  best: { first: 7, second: 7, season: 15 },
  bonus: [...DEFAULT_FEDEX_BONUS],
  system: 'standard',
});

/** One played round: when, and each player's Stableford points. */
export interface FedexRound {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** Tie-break for rounds on the same date (e.g. when it was started). */
  order?: number;
  points: Record<string, number>;
  /** Brought in from outside the app (totals only, no scorecard). */
  imported?: boolean;
}

/** A round's results: each player's place, Stableford, bonus and Cup points. */
export interface FedexRoundResult {
  round: FedexRound;
  half: 1 | 2;
  rows: { playerId: string; place: number; tied: boolean; stableford: number; bonus: number; cup: number }[];
}

/** The bonus for a finishing place (1-based), or 0 past the end of the table. */
const bonusAt = (bonus: number[], place: number) => bonus[place - 1] ?? 0;

/** Places and Cup points for one round (ties share the bonuses of the places they cover). */
export function scoreRound(points: Record<string, number>, bonus: number[]) {
  const sorted = Object.entries(points).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return sorted.map(([playerId, stableford]) => {
    const first = 1 + sorted.filter(([, v]) => v > stableford).length;
    const n = sorted.filter(([, v]) => v === stableford).length;
    let sum = 0;
    for (let p = first; p < first + n; p++) sum += bonusAt(bonus, p);
    const b = Math.round((sum / n) * 100) / 100;
    return { playerId, place: first, tied: n > 1, stableford, bonus: b, cup: stableford + b };
  });
}

/** Rounds in play order, each marked 1st or 2nd half, with every player's Cup points. */
export function fedexRounds(rounds: FedexRound[], cfg: FedexConfig): FedexRoundResult[] {
  const all = [...(cfg.imported ?? []).map((r) => ({ ...r, imported: true })), ...rounds];
  const ordered = all.sort((a, b) => a.date.localeCompare(b.date) || (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
  return ordered.map((round, i) => ({
    round,
    half: (cfg.half.kind === 'date' ? round.date >= cfg.half.date : i >= cfg.half.count) ? 2 : 1,
    rows: scoreRound(round.points, cfg.bonus),
  }));
}

export interface FedexRow {
  playerId: string;
  position: number;
  /** Sum of the best N rounds' Cup points. */
  points: number;
  /** Rounds played in this part of the season. */
  played: number;
  /** Points per counted round. */
  average: number;
  /** The Nth best round (what a new round has to beat to count), when they've played N. */
  cutoff: number | null;
  /** Which rounds are in their best N. */
  counted: string[];
}

export type FedexPart = 'first' | 'second' | 'season';

/** Standings for the 1st half, 2nd half or the whole season. */
export function fedexStandings(results: FedexRoundResult[], cfg: FedexConfig, part: FedexPart, players: string[] = []): FedexRow[] {
  const n = part === 'first' ? cfg.best.first : part === 'second' ? cfg.best.second : cfg.best.season;
  const inPart = results.filter((r) => part === 'season' || r.half === (part === 'first' ? 1 : 2));
  const byPlayer = new Map<string, { roundId: string; cup: number }[]>();
  for (const id of players) byPlayer.set(id, []);
  for (const r of inPart) for (const row of r.rows) byPlayer.set(row.playerId, [...(byPlayer.get(row.playerId) ?? []), { roundId: r.round.id, cup: row.cup }]);
  const rows: FedexRow[] = [...byPlayer.entries()].map(([playerId, list]) => {
    const best = [...list].sort((a, b) => b.cup - a.cup).slice(0, n);
    const points = Math.round(best.reduce((s, x) => s + x.cup, 0) * 100) / 100;
    return { playerId, position: 0, points, played: list.length, average: best.length ? points / best.length : 0, cutoff: list.length >= n ? best[n - 1].cup : null, counted: best.map((x) => x.roundId) };
  });
  const key = (r: FedexRow) => [r.points, r.cutoff ?? -1, r.average];
  rows.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return a.playerId.localeCompare(b.playerId);
  });
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.position = prev && key(prev).every((v, j) => v === key(r)[j]) ? prev.position : i + 1;
  });
  return rows;
}

/** What a player's round did to their best N: how much it added (0 if it didn't count). */
export function roundGain(results: FedexRoundResult[], cfg: FedexConfig, part: FedexPart, playerId: string, roundId: string): { added: number; replaced: number | null } {
  const idx = results.findIndex((r) => r.round.id === roundId);
  const before = fedexStandings(results.slice(0, idx), cfg, part, [playerId]).find((r) => r.playerId === playerId)!;
  const after = fedexStandings(results.slice(0, idx + 1), cfg, part, [playerId]).find((r) => r.playerId === playerId)!;
  const n = part === 'first' ? cfg.best.first : part === 'second' ? cfg.best.second : cfg.best.season;
  return { added: Math.round((after.points - before.points) * 100) / 100, replaced: before.played >= n ? before.cutoff : null };
}
