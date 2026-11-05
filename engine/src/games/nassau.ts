import { scoreMatch, type MatchStatus } from '../matchplay';
import { consecutiveThru, sideName, wins } from '../scoring';
import type { BaseResult, HandicapSettings, Round, Side } from '../types';
import { buildMatchOutcomes } from './match';

export type NassauSegment = 'front' | 'back' | 'overall';

/** A manual press: a new 1-point match from `startHole` to the end of its segment. */
export interface NassauPress {
  segment: NassauSegment;
  /** 1-based hole number where the press starts. */
  startHole: number;
  pressedBy?: 'A' | 'B';
}

export interface NassauConfig {
  type: 'nassau';
  id?: string;
  title?: string;
  format: 'singles' | 'fourBall';
  sideA: Side;
  sideB: Side;
  presses?: NassauPress[];
  /** Halved front carries its point to the back; halved back carries to the overall. */
  carryovers?: boolean;
  handicap?: Partial<HandicapSettings>;
}

const RANGE: Record<NassauSegment, [number, number]> = {
  front: [1, 9],
  back: [10, 18],
  overall: [1, 18],
};

export interface NassauSegmentResult {
  segment: NassauSegment;
  status: MatchStatus;
  /** Points this segment is worth (1 + any carryover). */
  value: number;
  awardedTo: 'A' | 'B' | null;
  carriedForward: boolean;
}

export interface NassauPressResult extends NassauPress {
  status: MatchStatus;
  awardedTo: 'A' | 'B' | null;
}

export interface NassauResult extends BaseResult {
  type: 'nassau';
  segments: NassauSegmentResult[];
  presses: NassauPressResult[];
  points: { A: number; B: number };
  /** Points still carried with nowhere to go (overall halved with carryovers on). */
  unresolvedCarry: number;
}

export function playNassau(round: Round, cfg: NassauConfig): NassauResult {
  const { outcomes, holeCount, book } = buildMatchOutcomes(round, cfg.format, cfg.sideA, cfg.sideB, cfg.handicap);
  if (holeCount !== 18) throw new Error('Nassau needs an 18-hole round');

  const slice = (from: number, to: number) => scoreMatch(outcomes.slice(from - 1, to));
  const points = { A: 0, B: 0 };
  let carry = 0;
  const segments: NassauSegmentResult[] = (['front', 'back', 'overall'] as const).map((segment) => {
    const status = slice(...RANGE[segment]);
    const value = 1 + carry;
    carry = 0;
    let awardedTo: 'A' | 'B' | null = null;
    let carriedForward = false;
    if (status.winner === 'A' || status.winner === 'B') {
      awardedTo = status.winner;
      points[status.winner] += value;
    } else if (status.winner === 'halved' && cfg.carryovers) {
      carry = value;
      carriedForward = true;
    }
    return { segment, status, value, awardedTo, carriedForward };
  });

  const presses: NassauPressResult[] = (cfg.presses ?? []).map((p) => {
    const [from, to] = RANGE[p.segment];
    if (p.startHole < from || p.startHole > to) {
      throw new Error(`Press on hole ${p.startHole} is outside the ${p.segment} nine`);
    }
    const status = slice(p.startHole, to);
    const awardedTo = status.winner === 'A' || status.winner === 'B' ? status.winner : null;
    if (awardedTo) points[awardedTo] += 1;
    return { ...p, status, awardedTo };
  });

  const finished = segments.every((s) => s.status.finished) && presses.every((p) => p.status.finished);
  const nameA = sideName(round, cfg.sideA);
  const nameB = sideName(round, cfg.sideB);
  const winner = !finished ? null : points.A > points.B ? 'A' : points.B > points.A ? 'B' : null;
  const score = `${Math.max(points.A, points.B)}-${Math.min(points.A, points.B)}`;
  const summary = !finished
    ? `${nameA} ${points.A} - ${points.B} ${nameB} (in progress)`
    : winner
      ? `${winner === 'A' ? nameA : nameB} ${wins(winner === 'A' ? nameA : nameB)} the Nassau ${score}`
      : `Nassau tied ${score}`;
  const thru = consecutiveThru((i) => outcomes[i] !== null, holeCount);

  return {
    type: 'nassau',
    title: cfg.title ?? `Nassau: ${nameA} vs ${nameB}`,
    finished,
    thru,
    winnerIds: winner === 'A' ? [cfg.sideA.id] : winner === 'B' ? [cfg.sideB.id] : [],
    summary,
    postingEligible: true,
    standings: [
      { id: cfg.sideA.id, name: nameA, value: points.A, position: points.A >= points.B ? 1 : 2, thru },
      { id: cfg.sideB.id, name: nameB, value: points.B, position: points.B >= points.A ? 1 : 2, thru },
    ],
    strokes: book.strokeMap(),
    segments,
    presses,
    points,
    unresolvedCarry: carry,
  };
}
