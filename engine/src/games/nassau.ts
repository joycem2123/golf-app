import { scoreMatch, type MatchStatus } from '../matchplay';
import { consecutiveThru, sideName, wins } from '../scoring';
import type { BaseResult, HandicapSettings, Round, Side } from '../types';
import { buildMatchOutcomes } from './match';
import { playScramble, playShamble } from './strokeplay';

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
  /**
   * How each hole is decided. singles / fourBall / foursomes (alternate shot) are match play; scramble and shamble
   * compare the two teams' scores hole by hole (sides are the teams; a scramble team's card is keyed by its side id).
   */
  format: 'singles' | 'fourBall' | 'foursomes' | 'scramble' | 'shamble';
  /** Scramble: team handicap percentages (lowest handicap first). */
  percentages?: number[];
  /** Shamble: best N balls count per hole. */
  countBest?: number;
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
  /** Always 0: a halved 18 is split, so carried points never go unresolved. */
  unresolvedCarry: number;
}

/** 2.5 -> "2½", 0.5 -> "½" */
export function half(n: number): string {
  const whole = Math.floor(n);
  if (n - whole !== 0.5) return String(n);
  return whole === 0 ? '½' : `${whole}½`;
}

/** Hole-by-hole results (+1 A won, -1 B won, 0 halved, null not played) for the Nassau's format. */
function nassauOutcomes(round: Round, cfg: NassauConfig) {
  if (cfg.format === 'scramble' || cfg.format === 'shamble') {
    const teams = [cfg.sideA, cfg.sideB];
    const res =
      cfg.format === 'scramble'
        ? playScramble(round, { type: 'scramble', teams, percentages: cfg.percentages, handicap: cfg.handicap })
        : playShamble(round, { type: 'shamble', teams, countBest: cfg.countBest, handicap: cfg.handicap });
    const outcomes = res.match!.outcomes;
    return { outcomes, holeCount: outcomes.length, strokes: res.strokes };
  }
  const { outcomes, holeCount, book } = buildMatchOutcomes(round, cfg.format, cfg.sideA, cfg.sideB, cfg.handicap);
  return { outcomes, holeCount, strokes: book.strokeMap() };
}

export function playNassau(round: Round, cfg: NassauConfig): NassauResult {
  const { outcomes, holeCount, strokes } = nassauOutcomes(round, cfg);
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
    } else if (status.winner === 'halved') {
      if (cfg.carryovers && segment !== 'overall') {
        // Carryovers: a halved nine pushes its point to the next bet.
        carry = value;
        carriedForward = true;
      } else {
        // Otherwise a halved bet is split: half a point each.
        points.A += value / 2;
        points.B += value / 2;
      }
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
    else if (status.winner === 'halved') {
      points.A += 0.5;
      points.B += 0.5;
    }
    return { ...p, status, awardedTo };
  });

  const finished = segments.every((s) => s.status.finished) && presses.every((p) => p.status.finished);
  const nameA = sideName(round, cfg.sideA);
  const nameB = sideName(round, cfg.sideB);
  const winner = !finished ? null : points.A > points.B ? 'A' : points.B > points.A ? 'B' : null;
  const score = `${half(Math.max(points.A, points.B))}-${half(Math.min(points.A, points.B))}`;
  const summary = !finished
    ? `${nameA} ${half(points.A)} - ${half(points.B)} ${nameB} (in progress)`
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
    strokes,
    segments,
    presses,
    points,
    unresolvedCarry: carry,
  };
}
