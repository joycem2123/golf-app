/** Generic match-play state shared by singles, best ball, alternate shot, Nassau and presses. */

/** +1 = side A won the hole, -1 = side B won, 0 = halved, null = not played yet. */
export type HoleOutcome = 1 | 0 | -1 | null;

export interface MatchStatus {
  holesInMatch: number;
  thru: number;
  /** Positive = side A is up. */
  lead: number;
  remaining: number;
  finished: boolean;
  winner: 'A' | 'B' | 'halved' | null;
  dormie: boolean;
  /** Hole (within this match) where it was closed out, e.g. 16 for 3&2. */
  closedOutOnHole: number | null;
  /** Golf-style status: "3&2", "2 UP", "1 UP thru 12", "All square thru 4". */
  display: string;
  outcomes: HoleOutcome[];
}

export function compareScores(a: number | null, b: number | null): HoleOutcome {
  if (a === null || b === null) return null;
  return a < b ? 1 : a > b ? -1 : 0;
}

export function scoreMatch(outcomes: HoleOutcome[]): MatchStatus {
  const n = outcomes.length;
  let lead = 0;
  let thru = 0;
  let closed: number | null = null;
  for (let i = 0; i < n; i++) {
    const o = outcomes[i];
    if (o === null) break;
    lead += o;
    thru = i + 1;
    if (n - thru > 0 && Math.abs(lead) > n - thru) {
      closed = thru;
      break;
    }
  }
  const remaining = n - thru;
  const finished = n > 0 && (closed !== null || thru === n);
  const abs = Math.abs(lead);
  const winner = !finished ? null : lead > 0 ? 'A' : lead < 0 ? 'B' : 'halved';

  let display: string;
  if (closed !== null) display = `${abs}&${remaining}`;
  else if (finished) display = abs === 0 ? 'Halved' : `${abs} UP`;
  else if (thru === 0) display = 'Not started';
  else display = abs === 0 ? `All square thru ${thru}` : `${abs} UP thru ${thru}`;

  return {
    holesInMatch: n,
    thru,
    lead,
    remaining,
    finished,
    winner,
    dormie: !finished && abs > 0 && abs === remaining,
    closedOutOnHole: closed,
    display,
    outcomes,
  };
}
