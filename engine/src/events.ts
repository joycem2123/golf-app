/** Multi-round events: trips, Ryder Cup-style cups, seasons, and head-to-head records. */
import type { Player, PlayerId } from './types';

// ---------------------------------------------------------------- handicap lock

/** Snapshot every player's Handicap Index when an event starts. */
export function lockHandicaps(players: Pick<Player, 'id' | 'handicapIndex'>[]): Record<PlayerId, number> {
  return Object.fromEntries(players.map((p) => [p.id, p.handicapIndex]));
}

/** Use the locked index for every round in the event, whatever a player's current index is. */
export function applyLockedHandicaps(players: Player[], locked: Record<PlayerId, number>): Player[] {
  return players.map((p) => (p.id in locked ? { ...p, handicapIndex: locked[p.id] } : p));
}

// ---------------------------------------------------------------- pairings

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Pairing {
  sideA: PlayerId[];
  sideB: PlayerId[];
}

/** "Randomize Pairings": random matches between two teams (1 = singles, 2 = pairs). */
export function randomizePairings(
  teamA: PlayerId[],
  teamB: PlayerId[],
  perSide: 1 | 2,
  rng: () => number = Math.random,
): { pairings: Pairing[]; unpaired: PlayerId[] } {
  const a = shuffle(teamA, rng);
  const b = shuffle(teamB, rng);
  const count = Math.floor(Math.min(a.length, b.length) / perSide);
  const pairings: Pairing[] = [];
  for (let m = 0; m < count; m++) {
    pairings.push({
      sideA: a.slice(m * perSide, (m + 1) * perSide),
      sideB: b.slice(m * perSide, (m + 1) * perSide),
    });
  }
  return { pairings, unpaired: [...a.slice(count * perSide), ...b.slice(count * perSide)] };
}

// ---------------------------------------------------------------- recorded matches

export type MatchOutcome = 'A' | 'B' | 'halved';

/** A finished match stored for history, standings and head-to-head. */
export interface RecordedMatch {
  id: string;
  date: string;
  eventId?: string;
  seasonId?: string;
  /** e.g. 'singles', 'fourBall', 'foursomes', 'nassau'. */
  format: string;
  sideA: PlayerId[];
  sideB: PlayerId[];
  result: MatchOutcome;
  summary?: string;
}

// ---------------------------------------------------------------- Ryder Cup style

export interface CupMatch {
  id: string;
  session?: string;
  sideA: PlayerId[];
  sideB: PlayerId[];
  /** null = not finished yet. */
  result: MatchOutcome | null;
  /** Points the match is worth (default 1; a halve earns half each). */
  points?: number;
  /** Points each side actually won, for matches that pay split points (a Nassau won 2.5–0.5). Used once the match is finished. */
  split?: { A: number; B: number };
}

export interface CupStandings {
  teamA: number;
  teamB: number;
  totalPoints: number;
  remainingPoints: number;
  /** Points needed to win outright. */
  toWin: number;
  /** Points the holder needs to keep the cup (only if a holder is set). */
  toRetain: number | null;
  winner: 'A' | 'B' | 'tied' | null;
  /** Set when the holder kept the cup on a tie. */
  retainedBy: 'A' | 'B' | null;
  /** Live projection, counting in-progress matches as currently standing. */
  projected?: { teamA: number; teamB: number };
}

/**
 * Win = full points, halve = half each. A team wins when it passes half of all points.
 * If `holder` is set, the holder keeps the cup with exactly half.
 */
export function cupStandings(
  matches: CupMatch[],
  opts: { holder?: 'A' | 'B'; liveLeaders?: Record<string, 'A' | 'B' | 'halved'> } = {},
): CupStandings {
  let teamA = 0;
  let teamB = 0;
  let total = 0;
  let remaining = 0;
  let projA = 0;
  let projB = 0;
  for (const m of matches) {
    if (m.split && m.result !== null) {
      // Split-points match: each side keeps what it won.
      total += m.split.A + m.split.B;
      teamA += m.split.A;
      teamB += m.split.B;
      projA += m.split.A;
      projB += m.split.B;
      continue;
    }
    const pts = m.points ?? 1;
    total += pts;
    const r = m.result ?? opts.liveLeaders?.[m.id] ?? null;
    if (m.result === null) remaining += pts;
    if (m.result === 'A') teamA += pts;
    else if (m.result === 'B') teamB += pts;
    else if (m.result === 'halved') { teamA += pts / 2; teamB += pts / 2; }
    if (r === 'A') projA += pts;
    else if (r === 'B') projB += pts;
    else if (r === 'halved') { projA += pts / 2; projB += pts / 2; }
  }
  const half = total / 2;
  const toWin = half + 0.5;
  let winner: CupStandings['winner'] = null;
  let retainedBy: CupStandings['retainedBy'] = null;
  if (teamA > half) winner = 'A';
  else if (teamB > half) winner = 'B';
  else if (opts.holder && (opts.holder === 'A' ? teamA : teamB) >= half && total > 0) {
    // Holder has reached half: the other side can at best tie, so the holder keeps the cup.
    retainedBy = opts.holder;
    if (remaining === 0) winner = 'tied';
  } else if (remaining === 0 && total > 0) winner = 'tied';

  return {
    teamA,
    teamB,
    totalPoints: total,
    remainingPoints: remaining,
    toWin,
    toRetain: opts.holder ? half : null,
    winner,
    retainedBy,
    projected: opts.liveLeaders ? { teamA: projA, teamB: projB } : undefined,
  };
}

// ---------------------------------------------------------------- season standings

export interface SeasonPointsTable {
  win: number;
  halve: number;
  loss: number;
}

export interface SeasonRow {
  playerId: PlayerId;
  played: number;
  wins: number;
  losses: number;
  halves: number;
  points: number;
  position: number;
}

export function seasonStandings(
  matches: RecordedMatch[],
  table: SeasonPointsTable = { win: 1, halve: 0.5, loss: 0 },
): SeasonRow[] {
  const rows = new Map<PlayerId, SeasonRow>();
  const row = (id: PlayerId) => {
    if (!rows.has(id)) rows.set(id, { playerId: id, played: 0, wins: 0, losses: 0, halves: 0, points: 0, position: 0 });
    return rows.get(id)!;
  };
  for (const m of matches) {
    for (const [side, ids] of [['A', m.sideA], ['B', m.sideB]] as const) {
      for (const id of ids) {
        const r = row(id);
        r.played++;
        if (m.result === 'halved') { r.halves++; r.points += table.halve; }
        else if (m.result === side) { r.wins++; r.points += table.win; }
        else { r.losses++; r.points += table.loss; }
      }
    }
  }
  const sorted = [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins);
  sorted.forEach((r) => (r.position = 1 + sorted.filter((o) => o.points > r.points).length));
  return sorted;
}

// ---------------------------------------------------------------- head to head

export interface Record3 {
  wins: number;
  losses: number;
  halves: number;
}

export interface HeadToHead {
  playerA: PlayerId;
  playerB: PlayerId;
  /** From playerA's point of view. */
  overall: Record3;
  singles: Record3;
  team: Record3;
  /** Matches where they played as partners. */
  asPartners: Record3;
  matches: RecordedMatch[];
}

/** Every stored match where the two players were on opposite sides (and as partners). */
export function headToHead(matches: RecordedMatch[], a: PlayerId, b: PlayerId): HeadToHead {
  const blank = (): Record3 => ({ wins: 0, losses: 0, halves: 0 });
  const h: HeadToHead = { playerA: a, playerB: b, overall: blank(), singles: blank(), team: blank(), asPartners: blank(), matches: [] };
  const add = (r: Record3, outcome: 'win' | 'loss' | 'halve') => {
    if (outcome === 'win') r.wins++;
    else if (outcome === 'loss') r.losses++;
    else r.halves++;
  };
  for (const m of matches) {
    const aSide = m.sideA.includes(a) ? 'A' : m.sideB.includes(a) ? 'B' : null;
    const bSide = m.sideA.includes(b) ? 'A' : m.sideB.includes(b) ? 'B' : null;
    if (!aSide || !bSide) continue;
    const outcome = m.result === 'halved' ? 'halve' : m.result === aSide ? 'win' : 'loss';
    if (aSide === bSide) { add(h.asPartners, outcome); continue; }
    h.matches.push(m);
    add(h.overall, outcome);
    add(m.sideA.length === 1 && m.sideB.length === 1 ? h.singles : h.team, outcome);
  }
  return h;
}
