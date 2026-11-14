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

/** Player id → team letter ('A', 'B', 'C'…) from the Teams step. */
export type TeamOf = Record<string, string>;
type TeamLookup = (id: string) => string | undefined;

const lookup = (t?: TeamOf | TeamLookup): TeamLookup | undefined => (typeof t === 'function' ? t : t ? (id) => t[id] : undefined);
/** Every player is on a team. */
export const teamsSet = (ids: string[], t?: TeamOf | TeamLookup) => {
  const f = lookup(t);
  return !!f && ids.length > 0 && ids.every((id) => !!f(id));
};

/** Split each team into sides of `size` players; null if a team doesn't divide evenly. */
function sidesByTeam(ids: string[], team: TeamLookup, size: number): { t: string; sides: string[][] }[] | null {
  const letters = [...new Set(ids.map((id) => team(id)!))].sort();
  const out = [];
  for (const t of letters) {
    const members = ids.filter((id) => team(id) === t);
    if (members.length % size) return null;
    out.push({ t, sides: chunk(members, size) });
  }
  return out;
}

/** Pair sides from different teams (A v B, C v D…). Null if it can't be done evenly. */
function pairSides(pools: { t: string; sides: string[][] }[]): Matchup[] | null {
  const left = pools.map((p) => ({ t: p.t, sides: [...p.sides] }));
  const out: Matchup[] = [];
  for (;;) {
    const open = left.filter((p) => p.sides.length).sort((x, y) => y.sides.length - x.sides.length || x.t.localeCompare(y.t));
    if (open.length === 0) return out;
    if (open.length === 1) return null;
    const [p1, p2] = open[0].t < open[1].t ? [open[0], open[1]] : [open[1], open[0]];
    out.push({ a: p1.sides.shift()!, b: p2.sides.shift()!, ta: p1.t, tb: p2.t });
  }
}

/** Team sizes that split these players evenly into matches (respecting teams when they're set). */
export function teamSizesFor(k: GameKind, idsOrCount: string[] | number, t?: TeamOf | TeamLookup): number[] {
  const ids = typeof idsOrCount === 'number' ? Array.from({ length: idsOrCount }, (_, i) => String(i)) : idsOrCount;
  const team = lookup(t);
  const n = ids.length;
  return (gameInfo(k).teamSizes ?? []).filter((s) => {
    if (n < 2 * s || n % (2 * s)) return false;
    if (!team || !teamsSet(ids, team)) return true;
    const pools = sidesByTeam(ids, team, s);
    return !!pools && !!pairSides(pools);
  });
}

/** Why this game can't be played with these players (null = it can). */
export function gameFitProblem(g: GameInfo, idsOrCount: string[] | number, t?: TeamOf | TeamLookup): string | null {
  const n = typeof idsOrCount === 'number' ? idsOrCount : idsOrCount.length;
  const ids = typeof idsOrCount === 'number' ? null : idsOrCount;
  if (g.teams && !g.teamSizes && ids && t && !teamsSet(ids, t)) return 'Set up teams first';
  if (g.teamSizes) {
    if (teamSizesFor(g.kind, ids ?? n, t).length) return null;
    if (ids && t && teamsSet(ids, t) && teamSizesFor(g.kind, n).length) return 'Your teams can’t be split into even matches for this game';
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
  /** Team letters for each side (from the Teams step). */
  ta?: string;
  tb?: string;
  /** Hole this match starts on (default 1). */
  start?: number;
}

export interface GameDraft {
  kind: GameKind;
  net: boolean;
  mode: HandicapMode;
  /** Percent, e.g. 90. */
  allowancePct: number;
  /** player id → team letter from the Teams step */
  teamOf: TeamOf;
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
  /** Alternate Shot, Scramble, Shamble: also split into a Nassau (front 9, back 9, overall 18; 1 point each). */
  nassau?: boolean;
  /** 9 or 18 holes, the same for every match (older drafts: 18). */
  holes?: 9 | 18;
  /** Starting hole for games that aren't split into matches (default 1). */
  start?: number;
}

const chunk = <T,>(arr: T[], size: number) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

/**
 * Make matches of `size` v `size`. With teams set, each match is one team's side against
 * another team's (A v B, C v D…); otherwise players are paired in order.
 */
export function buildMatches(ids: string[], size: number, t?: TeamOf | TeamLookup): Matchup[] {
  const team = lookup(t);
  if (team && teamsSet(ids, team)) {
    const pools = sidesByTeam(ids, team, size);
    const paired = pools && pairSides(pools);
    if (paired) return paired;
  }
  return chunk(ids, size * 2).map((g) => ({ a: g.slice(0, size), b: g.slice(size) }));
}

export function newDraft(kind: GameKind, players: { id: string }[], t?: TeamOf | TeamLookup): GameDraft {
  const info = gameInfo(kind);
  const team = lookup(t);
  const ids = players.map((p) => p.id);
  const sizes = teamSizesFor(kind, ids, team);
  // Best ball: prefer 2 v 2 matches when the group allows it.
  const teamSize = sizes.includes(2) ? 2 : (sizes[0] ?? info.teamSizes?.[0] ?? 1);
  return {
    kind,
    net: true,
    mode: 'offLow',
    allowancePct: Math.round((info.defaultAllowance ?? 1) * 100),
    teamOf: Object.fromEntries(ids.map((id) => [id, team?.(id) ?? ''])),
    teamSize,
    matches: info.teamSizes ? buildMatches(ids, teamSize, team) : [],
    carryovers: kind === 'skins',
    validation: 'none',
    wolfTies: 'noPoints',
    wolfLastHoles: 'lowestPoints',
    wolfPoints: { ...DEFAULT_WOLF_POINTS },
    birdieFlip: true,
    tenPlusRule: 'highFirst',
    stablefordSystem: 'standard',
    countBest: 1,
    holes: 18,
    start: 1,
  };
}

/** Why this game can't be played with these players (null = OK). */
export function draftProblem(d: GameDraft, players: Player[]): string | null {
  const info = gameInfo(d.kind);
  const fit = gameFitProblem(info, players.map((p) => p.id), d.teamOf);
  if (fit) return `${info.name}: ${fit.toLowerCase()}`;
  if (d.kind === 'nassau' && d.holes === 9) return 'Nassau needs 18 holes (front 9, back 9 and overall). Choose 18 holes or another game.';
  if (d.nassau && NASSAU_SPLIT.includes(d.kind) && d.holes === 9) return 'A Nassau needs 18 holes (front 9, back 9 and overall). Choose 18 holes or turn Nassau off.';
  if (info.teamSizes) {
    const used = d.matches.flatMap((m) => [...m.a, ...m.b]);
    const empty = used.filter((id) => !id).length;
    if (empty) return `Fill every team slot (${empty} empty)`;
    if (d.matches.some((m) => m.a.length !== d.teamSize || m.b.length !== d.teamSize)) return `Every match needs ${d.teamSize} v ${d.teamSize}`;
    if (used.length !== players.length || new Set(used).size !== used.length) return 'Put every player in exactly one match';
    return null;
  }
  if (info.teams) {
    const counts = Object.values(teamCounts(d.teamOf, players.map((p) => p.id)));
    if (counts.length < 2) return 'Put players on at least two teams';
    if (d.kind === 'scramble' && counts.some((n) => n < 2 || n > 4)) return 'Scramble teams need 2–4 players each';
    if (d.nassau && NASSAU_SPLIT.includes(d.kind) && counts.length !== 2) return 'A Nassau is two teams head to head. Use exactly two teams or turn Nassau off.';
  }
  return null;
}

export const TEAM_A = 'teamA';
export const TEAM_B = 'teamB';

/** 9 or 18 holes from a starting hole; undefined for the usual 18 from hole 1. */
export function playSpec(holes: 9 | 18 | undefined, start: number | undefined): GameConfig['play'] {
  const h = holes === 9 ? 9 : 18;
  const s = start && start >= 1 && start <= 18 ? start : 1;
  return h === 18 && s === 1 ? undefined : { holes: h, start: s };
}

const handicap = (d: GameDraft): { net: boolean; mode: HandicapMode; allowance: number } => ({ net: d.net, mode: d.mode, allowance: d.allowancePct / 100 });

/** Players per team letter. */
export function teamCounts(teamOf: TeamOf, ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) if (teamOf[id]) out[teamOf[id]] = (out[teamOf[id]] ?? 0) + 1;
  return out;
}

/** "team-C" → "Team C" (also the older "teamA"/"teamB" ids). */
export function teamIdName(id: string): string | null {
  const m = /^team-([A-Z])$/.exec(id) ?? /^team([AB])$/.exec(id);
  return m ? `Team ${m[1]}` : null;
}

/** Turn the setup screen's choices into the engine's games: one per match for match formats. */
function draftToConfigsRaw(d: GameDraft, players: Player[]): GameConfig[] {
  const ids = players.map((p) => p.id);
  const letters = [...new Set(ids.map((id) => d.teamOf[id]).filter(Boolean))].sort();
  const teams = letters.map((L) => ({ id: `team-${L}`, name: `Team ${L}`, members: ids.filter((id) => d.teamOf[id] === L) }));
  const hc = handicap(d);

  if (isMatchFormat(d.kind)) {
    return d.matches.map((m, i): GameConfig => {
      const id = `match-${i + 1}`;
      const single = d.teamSize === 1;
      // Side ids carry the team letter (match-1-A) so live scoring can label and colour them.
      const sideA = single ? { id: m.a[0], members: m.a } : { id: `${id}-${m.ta ?? 'A'}`, members: m.a };
      const sideB = single ? { id: m.b[0], members: m.b } : { id: `${id}-${m.tb ?? 'B'}`, members: m.b };
      switch (d.kind) {
        case 'singles':
          return { type: 'matchPlay', id, format: 'singles', sideA, sideB, handicap: hc };
        case 'bestBall':
          return { type: 'matchPlay', id, format: 'fourBall', sideA, sideB, handicap: hc };
        case 'alternateShot':
          return d.nassau
            ? { type: 'nassau', id, format: 'foursomes', sideA, sideB, presses: [], handicap: hc }
            : { type: 'matchPlay', id, format: 'foursomes', sideA, sideB, handicap: hc };
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
      if (d.nassau && teams.length === 2) return [{ type: 'nassau', format: 'scramble', sideA: teams[0], sideB: teams[1], presses: [], handicap: { net: d.net, mode: d.mode } }];
      return [{ type: 'scramble', teams, handicap: { net: d.net, mode: d.mode } }];
    case 'shamble':
      if (d.nassau && teams.length === 2) return [{ type: 'nassau', format: 'shamble', sideA: teams[0], sideB: teams[1], countBest: d.countBest, presses: [], handicap: hc }];
      return [{ type: 'shamble', teams, countBest: d.countBest, handicap: hc }];
    default:
      return [{ type: 'strokePlay', playerIds: ids, handicap: hc }];
  }
}

/** The draft as game configs, each with its holes and starting hole. */
export function draftToConfigs(d: GameDraft, players: Player[]): GameConfig[] {
  const configs = draftToConfigsRaw(d, players);
  const match = isMatchFormat(d.kind);
  return configs.map((g, i) => {
    const play = playSpec(d.holes, match ? d.matches[i]?.start : d.start);
    return play ? { ...g, play } : g;
  });
}

/** "Match 2" for one of several matches in a round (null for a single match or other games). */
export function matchLabel(game: GameConfig): string | null {
  const m = /^match-(\d+)$/.exec((game as { id?: string }).id ?? '');
  return m ? `Match ${m[1]}` : null;
}

/** Card title for a game: "Match 1: John vs Matt", "Side match: John vs Matt", or the game's name for group games. */
export function gameTitle(g: GameConfig, players: { id: string; name: string }[]): string {
  const first = (id: string) => (players.find((p) => p.id === id)?.name ?? '?').split(' ')[0];
  const side = (ids: string[]) => ids.map(first).join(' & ');
  let sides: [string, string] | null = null;
  if (g.type === 'matchPlay' || g.type === 'nassau') sides = [side(g.sideA.members), side(g.sideB.members)];
  else if (g.type === 'vegas') sides = [side(g.teamA.members), side(g.teamB.members)];
  else if ((g.type === 'scramble' || g.type === 'shamble') && g.teams.length === 2) sides = [side(g.teams[0].members), side(g.teams[1].members)];
  if (!sides) return gameName(g);
  const vs = `${sides[0]} vs ${sides[1]}`;
  const label = matchLabel(g);
  if (label) return `${label}: ${vs}`;
  if (((g as { id?: string }).id ?? '').startsWith('side-')) return `Side match: ${vs}`;
  return `${gameName(g)}: ${vs}`;
}

/** Score rows (player or team keys) that take part in a game. */
export function gameKeys(g: GameConfig): string[] {
  switch (g.type) {
    case 'matchPlay':
      return g.format === 'foursomes' ? [g.sideA.id, g.sideB.id] : [...g.sideA.members, ...g.sideB.members];
    case 'nassau':
      return nassauTeamCard(g) ? [g.sideA.id, g.sideB.id] : [...g.sideA.members, ...g.sideB.members];
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

export function sideMatchConfig(a: string, b: string, play?: GameConfig['play']): GameConfig {
  return {
    ...(play ? { play } : {}),
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
  if (game.type === 'nassau' && nassauTeamCard(game)) return [game.sideA, game.sideB].map((s) => ({ key: s.id, members: s.members }));
  return [];
}

/** Games that can also be split into a Nassau (switch on the setup screen). */
export const NASSAU_SPLIT: GameKind[] = ['alternateShot', 'scramble', 'shamble'];

/** A Nassau where each team records one score per hole (alternate shot or scramble). */
export function nassauTeamCard(g: GameConfig): boolean {
  return g.type === 'nassau' && (g.format === 'foursomes' || g.format === 'scramble');
}

export function gameName(game: GameConfig): string {
  switch (game.type) {
    case 'matchPlay':
      return game.title ?? (game.format === 'singles' ? 'Singles Match Play' : game.format === 'fourBall' ? 'Best Ball' : 'Alternate Shot');
    case 'nassau':
      return game.format === 'foursomes' ? 'Alternate Shot Nassau' : game.format === 'scramble' ? 'Scramble Nassau' : game.format === 'shamble' ? 'Shamble Nassau' : 'Nassau';
    case 'skins': return game.handicap?.net === false ? 'Gross Skins' : 'Skins';
    case 'wolf': return 'Wolf';
    case 'vegas': return 'Vegas';
    case 'stableford': return game.system === 'modified' ? 'Modified Stableford' : 'Stableford';
    case 'scramble': return 'Scramble';
    case 'shamble': return 'Shamble';
    case 'strokePlay': return 'Stroke Play';
  }
}
