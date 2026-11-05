import {
  DEFAULT_ALLOWANCES,
  DEFAULT_WOLF_POINTS,
  type GameConfig,
  type HandicapMode,
  type MatchPlayConfig,
  type Player,
  type SkinsValidation,
  type WolfPoints,
} from '@golf/engine';

export type GameKind =
  | 'singles'
  | 'bestBall'
  | 'alternateShot'
  | 'nassau'
  | 'skins'
  | 'wolf'
  | 'vegas'
  | 'stableford'
  | 'scramble'
  | 'shamble'
  | 'strokePlay';

export interface GameInfo {
  kind: GameKind;
  name: string;
  blurb: string;
  minPlayers: number;
  maxPlayers: number;
  /** Players must be split into two teams. */
  teams: boolean;
  /** Exactly 2 per team. */
  pairs?: boolean;
  defaultAllowance: number | null;
}

export const GAMES: GameInfo[] = [
  { kind: 'singles', name: 'Singles Match Play', blurb: '1 v 1, hole by hole', minPlayers: 2, maxPlayers: 2, teams: false, defaultAllowance: DEFAULT_ALLOWANCES.singlesMatch },
  { kind: 'bestBall', name: 'Best Ball', blurb: '2 v 2 match, best net ball counts', minPlayers: 4, maxPlayers: 4, teams: true, pairs: true, defaultAllowance: DEFAULT_ALLOWANCES.fourBallMatch },
  { kind: 'alternateShot', name: 'Alternate Shot', blurb: '2 v 2, partners share one ball', minPlayers: 4, maxPlayers: 4, teams: true, pairs: true, defaultAllowance: DEFAULT_ALLOWANCES.foursomes },
  { kind: 'nassau', name: 'Nassau', blurb: 'Front 9, back 9 and overall, with presses', minPlayers: 2, maxPlayers: 4, teams: true, defaultAllowance: DEFAULT_ALLOWANCES.singlesMatch },
  { kind: 'skins', name: 'Skins', blurb: 'Win a hole outright to win the skin', minPlayers: 2, maxPlayers: 8, teams: false, defaultAllowance: DEFAULT_ALLOWANCES.skins },
  { kind: 'wolf', name: 'Wolf', blurb: 'Rotating wolf picks a partner or goes alone', minPlayers: 3, maxPlayers: 4, teams: false, defaultAllowance: DEFAULT_ALLOWANCES.wolf },
  { kind: 'vegas', name: 'Vegas', blurb: '2 v 2, team scores make a two-digit number', minPlayers: 4, maxPlayers: 4, teams: true, pairs: true, defaultAllowance: DEFAULT_ALLOWANCES.vegas },
  { kind: 'stableford', name: 'Stableford', blurb: 'Points for each hole vs par', minPlayers: 1, maxPlayers: 8, teams: false, defaultAllowance: DEFAULT_ALLOWANCES.stableford },
  { kind: 'scramble', name: 'Scramble', blurb: 'Team plays the best shot every time', minPlayers: 4, maxPlayers: 8, teams: true, defaultAllowance: null },
  { kind: 'shamble', name: 'Shamble', blurb: 'Best drive, then everyone plays their own ball', minPlayers: 4, maxPlayers: 8, teams: true, defaultAllowance: DEFAULT_ALLOWANCES.shamble },
  { kind: 'strokePlay', name: 'Stroke Play', blurb: 'Lowest total score wins', minPlayers: 1, maxPlayers: 8, teams: false, defaultAllowance: DEFAULT_ALLOWANCES.strokePlay },
];

export const gameInfo = (k: GameKind) => GAMES.find((g) => g.kind === k)!;

export interface GameDraft {
  kind: GameKind;
  net: boolean;
  mode: HandicapMode;
  /** Percent, e.g. 90. */
  allowancePct: number;
  /** player id -> 'A' | 'B' */
  teamOf: Record<string, 'A' | 'B'>;
  carryovers: boolean;
  validation: SkinsValidation;
  wolfTies: 'noPoints' | 'carryover';
  wolfLastHoles: 'lowestPoints' | 'rotation';
  wolfPoints: WolfPoints;
  birdieFlip: boolean;
  tenPlusRule: 'highFirst' | 'standard';
  stablefordSystem: 'standard' | 'modified';
  countBest: number;
}

export function newDraft(kind: GameKind, players: { id: string }[]): GameDraft {
  const info = gameInfo(kind);
  const half = Math.ceil(players.length / 2);
  return {
    kind,
    net: true,
    mode: 'offLow',
    allowancePct: Math.round((info.defaultAllowance ?? 1) * 100),
    teamOf: Object.fromEntries(players.map((p, i) => [p.id, i < half ? 'A' : 'B'])),
    carryovers: kind === 'skins',
    validation: 'none',
    wolfTies: 'noPoints',
    wolfLastHoles: 'lowestPoints',
    wolfPoints: { ...DEFAULT_WOLF_POINTS },
    birdieFlip: true,
    tenPlusRule: 'highFirst',
    stablefordSystem: 'standard',
    countBest: 1,
  };
}

/** Why this game can't be played with these players (null = OK). */
export function draftProblem(d: GameDraft, players: Player[]): string | null {
  const info = gameInfo(d.kind);
  const n = players.length;
  if (n < info.minPlayers || n > info.maxPlayers) {
    return info.minPlayers === info.maxPlayers
      ? `${info.name} needs exactly ${info.minPlayers} players`
      : `${info.name} needs ${info.minPlayers}–${info.maxPlayers} players`;
  }
  if (info.teams && !(d.kind === 'nassau' && n === 2)) {
    const a = players.filter((p) => d.teamOf[p.id] === 'A').length;
    const b = n - a;
    if (a === 0 || b === 0) return 'Put players on both teams';
    if (info.pairs && (a !== 2 || b !== 2)) return 'Each team needs exactly 2 players';
    if (d.kind === 'nassau' && (a !== 2 || b !== 2)) return 'Nassau is 1 v 1 or 2 v 2';
    if (d.kind === 'scramble' && (a > 4 || b > 4)) return 'Scramble teams are 2–4 players';
  }
  return null;
}

export const TEAM_A = 'teamA';
export const TEAM_B = 'teamB';

const handicap = (d: GameDraft) => ({ net: d.net, mode: d.mode, allowance: d.allowancePct / 100 });

/** Turn the setup screen's choices into the engine's game config. */
export function draftToConfig(d: GameDraft, players: Player[]): GameConfig {
  const ids = players.map((p) => p.id);
  const a = ids.filter((id) => d.teamOf[id] === 'A');
  const b = ids.filter((id) => d.teamOf[id] === 'B');
  const teamA = { id: TEAM_A, members: a };
  const teamB = { id: TEAM_B, members: b };

  switch (d.kind) {
    case 'singles':
      return { type: 'matchPlay', format: 'singles', sideA: { id: ids[0], members: [ids[0]] }, sideB: { id: ids[1], members: [ids[1]] }, handicap: handicap(d) };
    case 'bestBall':
      return { type: 'matchPlay', format: 'fourBall', sideA: teamA, sideB: teamB, handicap: handicap(d) };
    case 'alternateShot':
      return { type: 'matchPlay', format: 'foursomes', sideA: teamA, sideB: teamB, handicap: handicap(d) };
    case 'nassau':
      return ids.length === 2
        ? { type: 'nassau', format: 'singles', sideA: { id: ids[0], members: [ids[0]] }, sideB: { id: ids[1], members: [ids[1]] }, carryovers: d.carryovers, presses: [], handicap: handicap(d) }
        : { type: 'nassau', format: 'fourBall', sideA: teamA, sideB: teamB, carryovers: d.carryovers, presses: [], handicap: handicap(d) };
    case 'skins':
      return { type: 'skins', playerIds: ids, carryovers: d.carryovers, validation: d.validation, handicap: handicap(d) };
    case 'wolf':
      return { type: 'wolf', order: ids, decisions: [], points: d.wolfPoints, ties: d.wolfTies, lastHoles: d.wolfLastHoles, handicap: handicap(d) };
    case 'vegas':
      return {
        type: 'vegas',
        teamA: { id: TEAM_A, name: 'Team A', members: [a[0], a[1]] },
        teamB: { id: TEAM_B, name: 'Team B', members: [b[0], b[1]] },
        birdieFlip: d.birdieFlip,
        tenPlusRule: d.tenPlusRule,
        handicap: handicap(d),
      };
    case 'stableford':
      return { type: 'stableford', playerIds: ids, system: d.stablefordSystem, handicap: handicap(d) };
    case 'scramble':
      return { type: 'scramble', teams: [teamA, teamB], handicap: { net: d.net, mode: d.mode } };
    case 'shamble':
      return { type: 'shamble', teams: [teamA, teamB], countBest: d.countBest, handicap: handicap(d) };
    case 'strokePlay':
      return { type: 'strokePlay', playerIds: ids, handicap: handicap(d) };
  }
}

export function sideMatchConfig(a: string, b: string): MatchPlayConfig {
  return {
    type: 'matchPlay',
    id: `side-${a}-${b}`,
    title: 'Side match',
    format: 'singles',
    sideA: { id: a, members: [a] },
    sideB: { id: b, members: [b] },
  };
}

/** Formats where a team records a single score (scorecard keyed by team). */
export function teamCardKeys(game: GameConfig): { key: string; members: string[] }[] {
  if (game.type === 'matchPlay' && game.format === 'foursomes') return [game.sideA, game.sideB].map((s) => ({ key: s.id, members: s.members }));
  if (game.type === 'scramble') return game.teams.map((t) => ({ key: t.id, members: t.members }));
  return [];
}

export function gameName(game: GameConfig): string {
  switch (game.type) {
    case 'matchPlay':
      return game.title ?? (game.format === 'singles' ? 'Singles Match Play' : game.format === 'fourBall' ? 'Best Ball' : 'Alternate Shot');
    case 'nassau': return 'Nassau';
    case 'skins': return game.handicap?.net === false ? 'Gross Skins' : 'Skins';
    case 'wolf': return 'Wolf';
    case 'vegas': return 'Vegas';
    case 'stableford': return game.system === 'modified' ? 'Modified Stableford' : 'Stableford';
    case 'scramble': return 'Scramble';
    case 'shamble': return 'Shamble';
    case 'strokePlay': return 'Stroke Play';
  }
}
