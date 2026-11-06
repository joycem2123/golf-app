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
  /** Players are split into two teams (scramble/shamble style: one team v another). */
  teams: boolean;
  /**
   * Match formats: allowed players per side. A big group plays several matches at once
   * (8 players of singles = 4 matches; best ball 2 v 2 = 2 matches, or 4 v 4 = 1 match).
   */
  teamSizes?: number[];
  defaultAllowance: number | null;
}

export const GAMES: GameInfo[] = [
  { kind: 'singles', name: 'Singles Match Play', blurb: '1 v 1, hole by hole', minPlayers: 2, maxPlayers: 16, teams: false, teamSizes: [1], defaultAllowance: DEFAULT_ALLOWANCES.singlesMatch },
  { kind: 'bestBall', name: 'Best Ball', blurb: 'Team match, best net ball counts', minPlayers: 4, maxPlayers: 16, teams: true, teamSizes: [2, 3, 4], defaultAllowance: DEFAULT_ALLOWANCES.fourBallMatch },
  { kind: 'alternateShot', name: 'Alternate Shot', blurb: '2 v 2, partners share one ball', minPlayers: 4, maxPlayers: 16, teams: true, teamSizes: [2], defaultAllowance: DEFAULT_ALLOWANCES.foursomes },
  { kind: 'nassau', name: 'Nassau', blurb: 'Front 9, back 9 and overall, with presses', minPlayers: 2, maxPlayers: 16, teams: true, teamSizes: [1, 2], defaultAllowance: DEFAULT_ALLOWANCES.singlesMatch },
  { kind: 'skins', name: 'Skins', blurb: 'Win a hole outright to win the skin', minPlayers: 2, maxPlayers: 16, teams: false, defaultAllowance: DEFAULT_ALLOWANCES.skins },
  { kind: 'wolf', name: 'Wolf', blurb: 'Rotating wolf picks a partner or goes alone', minPlayers: 3, maxPlayers: 4, teams: false, defaultAllowance: DEFAULT_ALLOWANCES.wolf },
  { kind: 'vegas', name: 'Vegas', blurb: '2 v 2, team scores make a two-digit number', minPlayers: 4, maxPlayers: 16, teams: true, teamSizes: [2], defaultAllowance: DEFAULT_ALLOWANCES.vegas },
  { kind: 'stableford', name: 'Stableford', blurb: 'Points for each hole vs par', minPlayers: 1, maxPlayers: 16, teams: false, defaultAllowance: DEFAULT_ALLOWANCES.stableford },
  { kind: 'scramble', name: 'Scramble', blurb: 'Team plays the best shot every time', minPlayers: 4, maxPlayers: 8, teams: true, defaultAllowance: null },
  { kind: 'shamble', name: 'Shamble', blurb: 'Best drive, then everyone plays their own ball', minPlayers: 4, maxPlayers: 8, teams: true, defaultAllowance: DEFAULT_ALLOWANCES.shamble },
  { kind: 'strokePlay', name: 'Stroke Play', blurb: 'Lowest total score wins', minPlayers: 1, maxPlayers: 16, teams: false, defaultAllowance: DEFAULT_ALLOWANCES.strokePlay },
];

export const gameInfo = (k: GameKind) => GAMES.find((g) => g.kind === k)!;
export const isMatchFormat = (k: GameKind) => !!gameInfo(k).teamSizes;

/** Team sizes that split this many players evenly into matches. */
export function teamSizesFor(k: GameKind, n: number): number[] {
  return (gameInfo(k).teamSizes ?? []).filter((s) => n >= 2 * s && n % (2 * s) === 0);
}

/** Why this game can't be played with this many players (null = it can). */
export function gameFitProblem(g: GameInfo, n: number): string | null {
  if (g.teamSizes) {
    if (teamSizesFor(g.kind, n).length) return null;
    const groups = [...new Set(g.teamSizes.map((s) => 2 * s))];
    if (groups.length === 1 && groups[0] === 2) return 'Needs an even number of players';
    return `Needs groups of ${groups.join(' or ')} (e.g. ${groups.map((x) => `${x}, ${x * 2}`).join(' or ')} players)`;
  }
  if (n < g.minPlayers || n > g.maxPlayers) {
    return g.minPlayers === g.maxPlayers ? `Needs exactly ${g.minPlayers} players` : `Needs ${g.minPlayers}–${g.maxPlayers} players`;
  }
  return null;
}

export interface Matchup {
  a: string[];
  b: string[];
}

export interface GameDraft {
  kind: GameKind;
  net: boolean;
  mode: HandicapMode;
  /** Percent, e.g. 90. */
  allowancePct: number;
  /** player id -> 'A' | 'B' (scramble/shamble teams) */
  teamOf: Record<string, 'A' | 'B'>;
  /** Match formats: players per side, and who plays whom. */
  teamSize: number;
  matches: Matchup[];
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

const chunk = <T,>(arr: T[], size: number) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

/**
 * Pair players into matches of `size` v `size`, in order. With event teams (Ryder Cup),
 * every match is one team against the other.
 */
export function buildMatches(ids: string[], size: number, teamOf?: (id: string) => 'A' | 'B' | undefined): Matchup[] {
  if (teamOf && ids.some((id) => teamOf(id))) {
    const a = chunk(ids.filter((id) => teamOf(id) === 'A'), size);
    const b = chunk(ids.filter((id) => teamOf(id) !== 'A'), size);
    return a.map((side, i) => ({ a: side, b: b[i] ?? [] }));
  }
  return chunk(ids, size * 2).map((g) => ({ a: g.slice(0, size), b: g.slice(size) }));
}

export function newDraft(kind: GameKind, players: { id: string }[], teamOf?: (id: string) => 'A' | 'B' | undefined): GameDraft {
  const info = gameInfo(kind);
  const half = Math.ceil(players.length / 2);
  const ids = players.map((p) => p.id);
  const sizes = teamSizesFor(kind, ids.length);
  // Best ball: prefer 2 v 2 matches when the group allows it.
  const teamSize = sizes.includes(2) ? 2 : (sizes[0] ?? info.teamSizes?.[0] ?? 1);
  return {
    kind,
    net: true,
    mode: 'offLow',
    allowancePct: Math.round((info.defaultAllowance ?? 1) * 100),
    teamOf: Object.fromEntries(players.map((p, i) => [p.id, teamOf?.(p.id) ?? (i < half ? 'A' : 'B')])),
    teamSize,
    matches: info.teamSizes ? buildMatches(ids, teamSize, teamOf) : [],
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
  const fit = gameFitProblem(info, players.length);
  if (fit) return `${info.name}: ${fit.toLowerCase()}`;
  if (info.teamSizes) {
    const used = d.matches.flatMap((m) => [...m.a, ...m.b]);
    const empty = used.filter((id) => !id).length;
    if (empty) return `Fill every team slot (${empty} empty)`;
    if (d.matches.some((m) => m.a.length !== d.teamSize || m.b.length !== d.teamSize)) return `Every match needs ${d.teamSize} v ${d.teamSize}`;
    if (used.length !== players.length || new Set(used).size !== used.length) return 'Put every player in exactly one match';
    return null;
  }
  if (info.teams) {
    const a = players.filter((p) => d.teamOf[p.id] === 'A').length;
    const b = players.length - a;
    if (a === 0 || b === 0) return 'Put players on both teams';
    if (d.kind === 'scramble' && (a > 4 || b > 4)) return 'Scramble teams are 2–4 players';
  }
  return null;
}

export const TEAM_A = 'teamA';
export const TEAM_B = 'teamB';

const handicap = (d: GameDraft): { net: boolean; mode: HandicapMode; allowance: number } => ({ net: d.net, mode: d.mode, allowance: d.allowancePct / 100 });

/** Turn the setup screen's choices into the engine's games: one per match for match formats. */
export function draftToConfigs(d: GameDraft, players: Player[]): GameConfig[] {
  const ids = players.map((p) => p.id);
  const a = ids.filter((id) => d.teamOf[id] === 'A');
  const b = ids.filter((id) => d.teamOf[id] === 'B');
  const teamA = { id: TEAM_A, members: a };
  const teamB = { id: TEAM_B, members: b };
  const hc = handicap(d);

  if (isMatchFormat(d.kind)) {
    return d.matches.map((m, i): GameConfig => {
      const id = `match-${i + 1}`;
      const single = d.teamSize === 1;
      const sideA = single ? { id: m.a[0], members: m.a } : { id: `${id}-a`, members: m.a };
      const sideB = single ? { id: m.b[0], members: m.b } : { id: `${id}-b`, members: m.b };
      switch (d.kind) {
        case 'singles':
          return { type: 'matchPlay', id, format: 'singles', sideA, sideB, handicap: hc };
        case 'bestBall':
          return { type: 'matchPlay', id, format: 'fourBall', sideA, sideB, handicap: hc };
        case 'alternateShot':
          return { type: 'matchPlay', id, format: 'foursomes', sideA, sideB, handicap: hc };
        case 'nassau':
          return { type: 'nassau', id, format: single ? 'singles' : 'fourBall', sideA, sideB, carryovers: d.carryovers, presses: [], handicap: hc };
        default: // vegas
          return {
            type: 'vegas',
            id,
            teamA: { id: sideA.id, members: [m.a[0], m.a[1]] },
            teamB: { id: sideB.id, members: [m.b[0], m.b[1]] },
            birdieFlip: d.birdieFlip,
            tenPlusRule: d.tenPlusRule,
            handicap: hc,
          };
      }
    });
  }

  switch (d.kind) {
    case 'skins':
      return [{ type: 'skins', playerIds: ids, carryovers: d.carryovers, validation: d.validation, handicap: hc }];
    case 'wolf':
      return [{ type: 'wolf', order: ids, decisions: [], points: d.wolfPoints, ties: d.wolfTies, lastHoles: d.wolfLastHoles, handicap: hc }];
    case 'stableford':
      return [{ type: 'stableford', playerIds: ids, system: d.stablefordSystem, handicap: hc }];
    case 'scramble':
      return [{ type: 'scramble', teams: [teamA, teamB], handicap: { net: d.net, mode: d.mode } }];
    case 'shamble':
      return [{ type: 'shamble', teams: [teamA, teamB], countBest: d.countBest, handicap: hc }];
    default:
      return [{ type: 'strokePlay', playerIds: ids, handicap: hc }];
  }
}

/** "Match 2" for one of several matches in a round (null for a single match or other games). */
export function matchLabel(game: GameConfig): string | null {
  const m = /^match-(\d+)$/.exec((game as { id?: string }).id ?? '');
  return m ? `Match ${m[1]}` : null;
}

/** Score rows (player or team keys) that take part in a game. */
export function gameKeys(g: GameConfig): string[] {
  switch (g.type) {
    case 'matchPlay':
      return g.format === 'foursomes' ? [g.sideA.id, g.sideB.id] : [...g.sideA.members, ...g.sideB.members];
    case 'nassau':
      return [...g.sideA.members, ...g.sideB.members];
    case 'vegas':
      return [...g.teamA.members, ...g.teamB.members];
    case 'wolf':
      return g.order;
    case 'scramble':
      return g.teams.map((t) => t.id);
    case 'shamble':
      return g.teams.flatMap((t) => t.members);
    default:
      return g.playerIds ?? [];
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
