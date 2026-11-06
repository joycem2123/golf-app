import { holeOrder, isStandardPlay, realStatus, toReal, viewRound, type PlaySpec } from '../play';
import type { Round } from '../types';
import { playMatch, type MatchPlayConfig, type MatchPlayResult } from './match';
import { playNassau, type NassauConfig, type NassauResult } from './nassau';
import { playSkins, type SkinsConfig, type SkinsResult } from './skins';
import { playStableford, type StablefordConfig, type StablefordResult } from './stableford';
import {
  playScramble,
  playShamble,
  playStrokePlay,
  type ScrambleConfig,
  type ShambleConfig,
  type StrokePlayConfig,
  type StrokeResult,
} from './strokeplay';
import { playVegas, type VegasConfig, type VegasResult } from './vegas';
import { playWolf, type WolfConfig, type WolfResult } from './wolf';

export type GameConfig = (
  | MatchPlayConfig
  | NassauConfig
  | SkinsConfig
  | WolfConfig
  | VegasConfig
  | StablefordConfig
  | ScrambleConfig
  | ShambleConfig
  | StrokePlayConfig
) & {
  /** 9 or 18 holes, and the starting hole. Missing = 18 holes from hole 1. */
  play?: PlaySpec;
};

export type GameResult =
  | MatchPlayResult
  | NassauResult
  | SkinsResult
  | WolfResult
  | VegasResult
  | StablefordResult
  | StrokeResult;

function run(round: Round, game: GameConfig): GameResult {
  switch (game.type) {
    case 'matchPlay': return playMatch(round, game);
    case 'nassau': return playNassau(round, game);
    case 'skins': return playSkins(round, game);
    case 'wolf': return playWolf(round, game);
    case 'vegas': return playVegas(round, game);
    case 'stableford': return playStableford(round, game);
    case 'scramble': return playScramble(round, game);
    case 'shamble': return playShamble(round, game);
    case 'strokePlay': return playStrokePlay(round, game);
  }
}

/** Real hole numbers a game covers, in playing order. */
export function gameHoleOrder(round: Round, game: GameConfig): number[] {
  return holeOrder(game.play, round.course.tees[0]?.holes.length ?? 18);
}

/**
 * Score any game. A round can run several games at once (e.g. a main game plus singles side matches).
 * Games played over 9 holes or from another starting hole are scored in playing order, then mapped
 * back to real hole numbers.
 */
export function evaluateGame(round: Round, game: GameConfig): GameResult {
  if (isStandardPlay(game.play)) return run(round, game);
  const total = round.course.tees[0]?.holes.length ?? 18;
  const order = holeOrder(game.play, total);
  const view = viewRound(round, order, order.length < total);
  const pos = (n: number) => order.indexOf(n) + 1; // 1-based position in playing order, 0 if not played

  let cfg: GameConfig = game;
  if (game.type === 'wolf') cfg = { ...game, decisions: order.map((n) => game.decisions[n - 1] ?? null) };
  if (game.type === 'nassau') {
    cfg = {
      ...game,
      presses: (game.presses ?? [])
        .filter((p) => pos(p.startHole) > 0)
        .map((p) => ({ ...p, startHole: pos(p.startHole), segment: p.segment === 'overall' ? 'overall' : pos(p.startHole) <= 9 ? 'front' : 'back' })),
    };
  }

  const res = run(view, cfg);
  const strokes = Object.fromEntries(Object.entries(res.strokes).map(([k, a]) => [k, toReal(a, order, 0, total)]));
  const base = { ...res, strokes, holeOrder: order };
  const hole = <T extends { hole: number }>(h: T): T => ({ ...h, hole: order[h.hole - 1] ?? h.hole });
  switch (res.type) {
    case 'matchPlay':
      return { ...base, type: 'matchPlay', status: realStatus(res.status, order, total) } as GameResult;
    case 'nassau': {
      const offset = { front: 0, back: 9, overall: 0 } as const;
      return {
        ...base,
        type: 'nassau',
        segments: res.segments.map((s) => ({ ...s, status: realStatus(s.status, order, total, offset[s.segment]) })),
        presses: res.presses.map((p) => ({ ...p, startHole: order[p.startHole - 1], status: realStatus(p.status, order, total, p.startHole - 1) })),
      } as GameResult;
    }
    case 'skins':
    case 'vegas':
    case 'wolf':
      return { ...base, holes: (res.holes as { hole: number }[]).map(hole) } as GameResult;
    case 'stableford':
      return { ...base, holePoints: Object.fromEntries(Object.entries(res.holePoints).map(([k, a]) => [k, toReal(a, order, null, total)])) } as GameResult;
    default:
      return { ...base, ...(res.match ? { match: realStatus(res.match, order, total) } : {}) } as GameResult;
  }
}

export function evaluateRound(round: Round, games: GameConfig[]): GameResult[] {
  return games.map((g) => evaluateGame(round, g));
}

export * from './match';
export * from './nassau';
export * from './skins';
export * from './stableford';
export * from './strokeplay';
export * from './vegas';
export * from './wolf';
