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

export type GameConfig =
  | MatchPlayConfig
  | NassauConfig
  | SkinsConfig
  | WolfConfig
  | VegasConfig
  | StablefordConfig
  | ScrambleConfig
  | ShambleConfig
  | StrokePlayConfig;

export type GameResult =
  | MatchPlayResult
  | NassauResult
  | SkinsResult
  | WolfResult
  | VegasResult
  | StablefordResult
  | StrokeResult;

/** Score any game. A round can run several games at once (e.g. a main game plus singles side matches). */
export function evaluateGame(round: Round, game: GameConfig): GameResult {
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
