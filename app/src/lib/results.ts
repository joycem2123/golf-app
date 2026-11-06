import type { GameConfig, GameResult } from '@golf/engine';

import type { RoundRecord } from '@/store/store';
import { gameName, matchLabel } from './games';

export interface ResultSide {
  /** Team letter ("A", "B", "C"…) when the round has teams. */
  letter: string;
  members: string[];
  names: string;
}

export interface MatchOutcome {
  gi: number;
  title: string;
  a: ResultSide;
  b: ResultSide;
  winner: 'a' | 'b' | 'halved' | null;
  /** e.g. "wins 3&2", "Halved", "2 UP thru 14". */
  detail: string;
  /** Points each side earns toward the team total (1 win, ½ halve; Nassau: its points). */
  pointsA: number;
  pointsB: number;
}

export interface TeamTotal {
  letter: string;
  members: string[];
  points: number;
  wins: number;
  halves: number;
  losses: number;
}

const firstName = (n: string) => n.trim().split(' ')[0];

/** Team letter of a side: from the Teams step, else its id ("match-2-C", "team-C"), else by position. */
function letterOf(r: RoundRecord, id: string, members: string[], fallback: string): string {
  const t = r.teamOf?.[members[0]];
  if (t) return t;
  return /-([A-Z])$/.exec(id)?.[1] ?? /^team([A-Z])$/.exec(id)?.[1] ?? fallback;
}

function sidesOf(g: GameConfig): [{ id: string; members: string[] }, { id: string; members: string[] }] | null {
  if (g.type === 'matchPlay' || g.type === 'nassau') return [g.sideA, g.sideB];
  if (g.type === 'vegas') return [g.teamA, g.teamB];
  return null;
}

/** Head-to-head games in the round (team matches, singles, side matches, Nassau, Vegas). */
export function matchOutcomes(r: RoundRecord, results: (GameResult | { error: string })[]): MatchOutcome[] {
  const name = (id: string) => r.players.find((p) => p.id === id)?.name ?? id;
  const out: MatchOutcome[] = [];
  r.games.forEach((g, gi) => {
    const res = results[gi];
    const sides = sidesOf(g);
    if (!sides || !res || 'error' in res) return;
    const side = (s: { id: string; members: string[] }, fb: string): ResultSide => ({
      letter: letterOf(r, s.id, s.members, fb),
      members: s.members,
      names: s.members.map((m) => (s.members.length > 1 ? firstName(name(m)) : name(m))).join(' & '),
    });
    const a = side(sides[0], 'A');
    const b = side(sides[1], 'B');
    let winner: MatchOutcome['winner'] = null;
    if (res.type === 'nassau') {
      if (res.finished) winner = res.points.A > res.points.B ? 'a' : res.points.B > res.points.A ? 'b' : 'halved';
    } else if (res.winnerIds.includes(sides[0].id)) winner = 'a';
    else if (res.winnerIds.includes(sides[1].id)) winner = 'b';
    else if (res.finished) winner = 'halved';
    let detail = res.summary;
    if (res.type === 'matchPlay') {
      const st = res.status;
      detail = winner === 'halved' ? 'Halved' : winner ? st.display : st.lead === 0 ? `All square thru ${st.thru}` : `${st.display} thru ${st.thru}`;
    } else if (res.type === 'nassau') detail = `${res.points.A % 1 ? res.points.A.toFixed(1) : res.points.A} – ${res.points.B % 1 ? res.points.B.toFixed(1) : res.points.B} pts`;
    else if (res.type === 'vegas') detail = `${Math.abs(res.totalA)} pts`;
    // Nassau pays its own points (front, back, overall and presses); other matches are 1 for a win, ½ each for a halve.
    const pts =
      res.type === 'nassau'
        ? [res.points.A, res.points.B]
        : winner === 'a' ? [1, 0] : winner === 'b' ? [0, 1] : winner === 'halved' ? [0.5, 0.5] : [0, 0];
    const label = matchLabel(g);
    out.push({ gi, title: label ? `${label === 'Side match' ? 'Side match' : label} · ${gameName(g)}` : gameName(g), a, b, winner, detail, pointsA: pts[0], pointsB: pts[1] });
  });
  return out;
}

/** Points per team across the team matches (side matches don't count toward the team score). */
export function teamTotals(r: RoundRecord, matches: MatchOutcome[]): TeamTotal[] {
  const byLetter = new Map<string, TeamTotal>();
  const get = (L: string) => {
    if (!byLetter.has(L)) byLetter.set(L, { letter: L, members: [], points: 0, wins: 0, halves: 0, losses: 0 });
    return byLetter.get(L)!;
  };
  if (r.teamOf) for (const [pid, L] of Object.entries(r.teamOf)) if (r.players.some((p) => p.id === pid)) get(L).members.push(pid);
  for (const m of matches) {
    if ((r.games[m.gi].id ?? '').startsWith('side-') || m.a.letter === m.b.letter) continue;
    const ta = get(m.a.letter);
    const tb = get(m.b.letter);
    for (const [t, s] of [[ta, m.a], [tb, m.b]] as const) for (const id of s.members) if (!t.members.includes(id)) t.members.push(id);
    ta.points += m.pointsA;
    tb.points += m.pointsB;
    if (m.winner === 'a') { ta.wins++; tb.losses++; }
    if (m.winner === 'b') { tb.wins++; ta.losses++; }
    if (m.winner === 'halved') { ta.halves++; tb.halves++; }
  }
  return [...byLetter.values()].sort((x, y) => y.points - x.points || x.letter.localeCompare(y.letter));
}


/** Team points in one round (null if the round has no team matches). */
export function roundTeamScore(r: RoundRecord, results: (GameResult | { error: string })[]): TeamTotal[] | null {
  const matches = matchOutcomes(r, results);
  const totals = teamTotals(r, matches);
  return totals.length >= 2 && matches.some((m) => m.a.letter !== m.b.letter) ? totals : null;
}
