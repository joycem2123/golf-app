import { DEFAULT_ALLOWANCES } from '../handicap';
import { individualBook, settingsWith } from '../scoring';
import type { BaseResult, HandicapSettings, Round } from '../types';

export interface VegasConfig {
  type: 'vegas';
  id?: string;
  title?: string;
  teamA: { id: string; name?: string; members: [string, string] };
  teamB: { id: string; name?: string; members: [string, string] };
  /** A birdie (or better) flips the opponents' number, high digit first. Cancels if both teams birdie. */
  birdieFlip?: boolean;
  /**
   * When a player scores 10+: 'highFirst' puts the big number first (4 & 10 => 104),
   * 'standard' keeps low first (4 & 10 => 410).
   */
  tenPlusRule?: 'highFirst' | 'standard';
  handicap?: Partial<HandicapSettings>;
}

export function vegasNumber(scores: [number, number], flip: boolean, tenPlusRule: 'highFirst' | 'standard'): number {
  const low = Math.min(...scores);
  const high = Math.max(...scores);
  const highFirst = flip || (tenPlusRule === 'highFirst' && high >= 10);
  return Number(highFirst ? `${high}${low}` : `${low}${high}`);
}

export interface VegasHole {
  hole: number;
  numberA: number;
  numberB: number;
  flipped: 'A' | 'B' | null;
  /** Points for team A this hole (negative = team B won the hole). */
  pointsA: number;
}

export interface VegasResult extends BaseResult {
  type: 'vegas';
  holes: VegasHole[];
  /** Running total for team A (negative = team B is ahead). */
  totalA: number;
}

export function playVegas(round: Round, cfg: VegasConfig): VegasResult {
  const settings = settingsWith({ allowance: DEFAULT_ALLOWANCES.vegas, mode: 'offLow', net: true }, cfg.handicap);
  const birdieFlip = cfg.birdieFlip ?? true;
  const tenPlus = cfg.tenPlusRule ?? 'highFirst';
  const ids = [...cfg.teamA.members, ...cfg.teamB.members];
  const { book } = individualBook(round, ids, settings);
  const holes: VegasHole[] = [];
  let totalA = 0;
  let thru = 0;

  for (let i = 0; i < book.holeCount; i++) {
    const s = ids.map((id) => book.score(id, i, settings.net));
    if (s.some((v) => v === null)) break;
    const a = [s[0]!, s[1]!] as [number, number];
    const b = [s[2]!, s[3]!] as [number, number];
    const par = book.par(ids[0], i);
    const birdieA = Math.min(...a) < par;
    const birdieB = Math.min(...b) < par;
    let flipped: 'A' | 'B' | null = null;
    if (birdieFlip && birdieA !== birdieB) flipped = birdieA ? 'B' : 'A';
    const numberA = vegasNumber(a, flipped === 'A', tenPlus);
    const numberB = vegasNumber(b, flipped === 'B', tenPlus);
    const pointsA = numberB - numberA;
    totalA += pointsA;
    holes.push({ hole: i + 1, numberA, numberB, flipped, pointsA });
    thru = i + 1;
  }

  const finished = thru === book.holeCount;
  const nameA = cfg.teamA.name ?? 'Team A';
  const nameB = cfg.teamB.name ?? 'Team B';
  const leader = totalA > 0 ? nameA : nameB;
  const summary =
    thru === 0
      ? 'Not started'
      : totalA === 0
        ? `All square${finished ? '' : ` thru ${thru}`}`
        : `${leader} ${finished ? 'wins' : 'leads'} by ${Math.abs(totalA)} pts`;

  return {
    type: 'vegas',
    title: cfg.title ?? `Vegas: ${nameA} vs ${nameB}`,
    finished,
    thru,
    winnerIds: finished && totalA !== 0 ? [totalA > 0 ? cfg.teamA.id : cfg.teamB.id] : [],
    summary,
    postingEligible: true,
    standings: [
      { id: cfg.teamA.id, name: nameA, value: totalA, position: totalA >= 0 ? 1 : 2, thru },
      { id: cfg.teamB.id, name: nameB, value: -totalA, position: totalA <= 0 ? 1 : 2, thru },
    ],
    strokes: book.strokeMap(),
    holes,
    totalA,
  };
}
