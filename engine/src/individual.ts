/**
 * Individual season points: every player builds their own total across the season, whatever the format or
 * whoever they partner with.
 *
 * - Matches (singles, best ball, alternate shot, Nassau, Vegas, two-team scramble / shamble, side matches): each
 *   player on a side earns the side's points (win / halve / loss; a Nassau pays its own points, e.g. 2½).
 * - Every other game (stroke play, Stableford, skins, wolf, a scramble of 3+ teams…): points by finishing place,
 *   from the event's place table (by default 1st 1, 2nd ½, everyone else 0). Players who tie share the points of
 *   the places they cover; everyone on a team gets the team's place points.
 */

export interface IndividualConfig {
  /** Points for 1st, 2nd, 3rd… in games that aren't matches. Places past the end of the list get 0. */
  places: number[];
}

export const DEFAULT_PLACE_POINTS = [1, 0.5];
export const defaultIndividual = (): IndividualConfig => ({ places: [...DEFAULT_PLACE_POINTS] });

const at = (places: number[], p: number) => places[p - 1] ?? 0;

/**
 * Place points for one game from finishing positions (1 = first; ties share a position).
 * `positions` maps each entry (player or team) to its position.
 */
export function placePoints(positions: Record<string, number>, places: number[]): Record<string, { place: number; tied: boolean; points: number }> {
  const out: Record<string, { place: number; tied: boolean; points: number }> = {};
  const ids = Object.keys(positions);
  for (const id of ids) {
    // Recompute from the order so "T2" covers the right places even if positions skip numbers.
    const first = 1 + ids.filter((o) => positions[o] < positions[id]).length;
    const n = ids.filter((o) => positions[o] === positions[id]).length;
    let sum = 0;
    for (let p = first; p < first + n; p++) sum += at(places, p);
    out[id] = { place: first, tied: n > 1, points: Math.round((sum / n) * 100) / 100 };
  }
  return out;
}

/** One thing a player earned points for in a round. */
export interface IndividualItem {
  roundId: string;
  /** e.g. "Nassau", "Stroke Play". */
  game: string;
  kind: 'match' | 'place';
  /** Match: won / halved / lost (null if the result isn't in yet). Place: finishing place. */
  result: 'won' | 'halved' | 'lost' | null;
  place?: number;
  tied?: boolean;
  /** "2½–½", "3&2", "1st of 4"… */
  detail: string;
  points: number;
}

export interface IndividualRow {
  playerId: string;
  points: number;
  matchPoints: number;
  placePoints: number;
  /** Rounds with at least one finished game. */
  rounds: number;
  wins: number;
  losses: number;
  halves: number;
  /** 1st-place finishes in non-match games. */
  firsts: number;
  position: number;
}

/** Season standings from every player's items. Ties on points go to more wins + firsts, then share the place. */
export function individualStandings(items: Record<string, IndividualItem[]>, players: string[] = []): IndividualRow[] {
  const ids = [...new Set([...players, ...Object.keys(items)])];
  const rows: IndividualRow[] = ids.map((playerId) => {
    const list = items[playerId] ?? [];
    const sum = (k: IndividualItem['kind']) => list.filter((i) => i.kind === k).reduce((s, i) => s + i.points, 0);
    const matchPoints = sum('match');
    const placePts = sum('place');
    return {
      playerId,
      points: Math.round((matchPoints + placePts) * 100) / 100,
      matchPoints,
      placePoints: placePts,
      rounds: new Set(list.map((i) => i.roundId)).size,
      wins: list.filter((i) => i.result === 'won').length,
      losses: list.filter((i) => i.result === 'lost').length,
      halves: list.filter((i) => i.result === 'halved').length,
      firsts: list.filter((i) => i.kind === 'place' && i.place === 1).length,
      position: 0,
    };
  });
  const key = (r: IndividualRow) => [r.points, r.wins + r.firsts];
  const better = (a: IndividualRow, b: IndividualRow) => {
    const [ka, kb] = [key(a), key(b)];
    return ka[0] !== kb[0] ? ka[0] > kb[0] : ka[1] > kb[1];
  };
  for (const r of rows) r.position = 1 + rows.filter((o) => better(o, r)).length;
  return rows.sort((a, b) => a.position - b.position || a.playerId.localeCompare(b.playerId));
}
