import { adjustForMode, courseHandicap, playingHandicap, strokeAllocation } from './handicap';
import type { HandicapSettings, Player, PlayerHandicap, Round, Side, Standing, Tee } from './types';

export function findTee(round: Round, teeId: string): Tee {
  const tee = round.course.tees.find((t) => t.id === teeId);
  if (!tee) throw new Error(`Unknown tee "${teeId}" at ${round.course.name}`);
  return tee;
}

export function findPlayer(round: Round, id: string): Player {
  const p = round.players.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown player "${id}"`);
  return p;
}

export interface ScoringUnit {
  /** Scorecard key: a player id, or a team id for team-card formats. */
  key: string;
  teeId: string;
  /** Strokes received for the round (after allowance and strokes-off-low). */
  handicap: number;
}

/** Looks up gross/net scores for the players or teams in one game. */
export class ScoreBook {
  readonly holeCount: number;
  private readonly strokes = new Map<string, number[]>();
  private readonly tees = new Map<string, Tee>();

  constructor(private readonly round: Round, units: ScoringUnit[]) {
    if (units.length === 0) throw new Error('A game needs at least one player or team');
    for (const u of units) {
      const tee = findTee(round, u.teeId);
      this.tees.set(u.key, tee);
      this.strokes.set(u.key, strokeAllocation(u.handicap, tee.holes));
    }
    this.holeCount = this.tees.get(units[0].key)!.holes.length;
  }

  gross(key: string, i: number): number | null {
    const v = this.round.scores[key]?.[i];
    return v == null ? null : v;
  }

  strokesReceived(key: string, i: number): number {
    return this.strokes.get(key)?.[i] ?? 0;
  }

  net(key: string, i: number): number | null {
    const g = this.gross(key, i);
    return g === null ? null : g - this.strokesReceived(key, i);
  }

  score(key: string, i: number, net: boolean): number | null {
    return net ? this.net(key, i) : this.gross(key, i);
  }

  /** Strokes received on every hole for every player/team in this game. */
  strokeMap(): Record<string, number[]> {
    return Object.fromEntries(this.strokes);
  }

  par(key: string, i: number): number {
    return this.tees.get(key)!.holes[i].par;
  }
}

/** Course, playing and match handicaps for individual players in one game. */
export function individualHandicaps(
  round: Round,
  playerIds: string[],
  settings: HandicapSettings,
): Record<string, PlayerHandicap> {
  const ch: Record<string, number> = {};
  const ph: Record<string, number> = {};
  for (const id of playerIds) {
    const p = findPlayer(round, id);
    ch[id] = courseHandicap(p.handicapIndex, findTee(round, p.teeId));
    ph[id] = playingHandicap(ch[id], settings.allowance);
  }
  const adj = adjustForMode(ph, settings.mode);
  const out: Record<string, PlayerHandicap> = {};
  for (const id of playerIds) {
    out[id] = { courseHandicap: ch[id], playingHandicap: ph[id], matchHandicap: adj[id] };
  }
  return out;
}

export function individualBook(round: Round, playerIds: string[], settings: HandicapSettings) {
  const handicaps = individualHandicaps(round, playerIds, settings);
  const book = new ScoreBook(
    round,
    playerIds.map((id) => ({
      key: id,
      teeId: findPlayer(round, id).teeId,
      handicap: handicaps[id].matchHandicap,
    })),
  );
  return { book, handicaps };
}

/** Best (lowest) score among keys on a hole; null until everyone has a score. */
export function bestOf(book: ScoreBook, keys: string[], i: number, net: boolean): number | null {
  const vals = keys.map((k) => book.score(k, i, net));
  if (vals.some((v) => v === null)) return null;
  return Math.min(...(vals as number[]));
}

/** Sum of the best N scores on a hole; null until everyone has a score. */
export function bestNSum(values: (number | null)[], n: number): number | null {
  if (values.some((v) => v === null)) return null;
  return [...(values as number[])].sort((a, b) => a - b).slice(0, n).reduce((s, v) => s + v, 0);
}

/** "Mike wins" but "Mike & Dave win". */
export function wins(name: string): string {
  return name.includes(' & ') ? 'win' : 'wins';
}

export function sideName(round: Round, side: Side): string {
  return side.name ?? side.members.map((id) => findPlayer(round, id).name).join(' & ');
}

/** Number of holes completed in a row from hole 1. */
export function consecutiveThru(complete: (i: number) => boolean, holeCount: number): number {
  let t = 0;
  while (t < holeCount && complete(t)) t++;
  return t;
}

/** Sort and rank rows; ties share a position. */
export function rankStandings(
  rows: Omit<Standing, 'position'>[],
  better: 'low' | 'high',
): Standing[] {
  const cmp = (a: number, b: number) => (better === 'low' ? a - b : b - a);
  const sorted = [...rows].sort((a, b) => cmp(a.value, b.value));
  return sorted.map((r) => ({
    ...r,
    position: 1 + sorted.filter((o) => cmp(o.value, r.value) < 0).length,
  }));
}

export function settingsWith(
  defaults: HandicapSettings,
  partial?: Partial<HandicapSettings>,
): HandicapSettings {
  return { ...defaults, ...partial };
}
