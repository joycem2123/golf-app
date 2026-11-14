import type { GameConfig, GameResult } from '@golf/engine';

import { useStore, type EventRecord, type RoundRecord } from '@/store/store';
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
  /**
   * A round in a team event where the sides don't line up with the event's teams (teammates on both sides, or a
   * side made up of players from different teams): the match is played and shown, but earns no team points.
   */
  mixed?: boolean;
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

/** Each player's team in a team event (Ryder Cup style events keep their teams as two lists). */
export function eventTeamMap(e: EventRecord | undefined): Record<string, string> | undefined {
  if (!e) return undefined;
  if (e.teams) return Object.fromEntries([...e.teams.A.playerIds.map((id) => [id, 'A']), ...e.teams.B.playerIds.map((id) => [id, 'B'])]);
  if (e.individual) return undefined;
  if (e.teamOf && Object.keys(e.teamOf).length && (e.teamLetters?.length ?? 2) >= 2) return e.teamOf;
  return undefined;
}

// Events shown outside the phone's store (the TV board loads its own).
const extraEvents = new Map<string, EventRecord>();
export function registerBoardEvent(e: EventRecord | undefined) {
  if (e) extraEvents.set(e.id, e);
}

/** The event teams a round's matches are scored by (undefined: the round's own teams). */
function seasonTeams(r: RoundRecord): Record<string, string> | undefined {
  if (!r.eventId) return undefined;
  const e = extraEvents.get(r.eventId) ?? useStore.getState().events.find((x) => x.id === r.eventId);
  return eventTeamMap(e);
}

/** A match counts toward the team score: not a side bet, two different teams, and lined up with the event's teams. */
export const countsForTeams = (r: RoundRecord, m: MatchOutcome) => !(r.games[m.gi].id ?? '').startsWith('side-') && m.a.letter !== m.b.letter && !m.mixed;

/** Team letter of a side: from the Teams step, else its id ("match-2-C", "team-C"), else by position. */
function letterOf(r: RoundRecord, id: string, members: string[], fallback: string): string {
  const t = r.teamOf?.[members[0]];
  if (t) return t;
  return /-([A-Z])$/.exec(id)?.[1] ?? /^team([A-Z])$/.exec(id)?.[1] ?? fallback;
}

function sidesOf(g: GameConfig): [{ id: string; members: string[] }, { id: string; members: string[] }] | null {
  if (g.type === 'matchPlay' || g.type === 'nassau') return [g.sideA, g.sideB];
  if (g.type === 'vegas') return [g.teamA, g.teamB];
  // A two-team scramble or shamble is played as a match.
  if ((g.type === 'scramble' || g.type === 'shamble') && g.teams.length === 2) return [g.teams[0], g.teams[1]];
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
    let a = side(sides[0], 'A');
    let b = side(sides[1], 'B');
    // In a team event, the event's teams decide who earns the point (not the labels picked for this round).
    let mixed = false;
    const season = seasonTeams(r);
    if (season) {
      const teamOfSide = (ids: string[]) => {
        const ls = [...new Set(ids.map((id) => season[id]))];
        return ls.length === 1 ? ls[0] : ls.length > 1 ? null : undefined; // undefined: nobody on a team; null: mixed
      };
      const ta = teamOfSide(a.members);
      const tb = teamOfSide(b.members);
      if (ta && tb && ta !== tb) {
        a = { ...a, letter: ta };
        b = { ...b, letter: tb };
      } else if (!(ta === undefined && tb === undefined && a.members.every((id) => !(id in season)) && b.members.every((id) => !(id in season)))) {
        mixed = true;
      }
    }
    let winner: MatchOutcome['winner'] = null;
    if (res.type === 'nassau') {
      if (res.finished) winner = res.points.A > res.points.B ? 'a' : res.points.B > res.points.A ? 'b' : 'halved';
    } else if (res.winnerIds.includes(sides[0].id)) winner = 'a';
    else if (res.winnerIds.includes(sides[1].id)) winner = 'b';
    else if (res.finished) winner = 'halved';
    let detail = res.summary;
    const st0 = res.type === 'matchPlay' ? res.status : (res.type === 'scramble' || res.type === 'shamble') && res.match ? res.match : null;
    if (st0) {
      const st = st0;
      detail = winner === 'halved' ? 'Halved' : winner ? st.display : st.lead === 0 ? `All square thru ${st.thru}` : `${Math.abs(st.lead)} UP thru ${st.thru}`;
    } else if (res.type === 'nassau') {
      // Leader's points first: "2½ – ½ pts".
      const f = (n: number) => (n % 1 ? `${Math.floor(n) || ''}½` : String(n));
      detail = `${f(Math.max(res.points.A, res.points.B))} – ${f(Math.min(res.points.A, res.points.B))} pts`;
    }
    else if (res.type === 'vegas') detail = `${Math.abs(res.totalA)} pts`;
    // Nassau pays its own points (front, back, overall and presses); other matches are 1 for a win, ½ each for a halve.
    const pts =
      res.type === 'nassau'
        ? [res.points.A, res.points.B]
        : winner === 'a' ? [1, 0] : winner === 'b' ? [0, 1] : winner === 'halved' ? [0.5, 0.5] : [0, 0];
    const label = matchLabel(g);
    out.push({ gi, title: label ? `${label === 'Side match' ? 'Side match' : label} · ${gameName(g)}` : gameName(g), a, b, winner, detail, pointsA: pts[0], pointsB: pts[1], ...(mixed ? { mixed } : {}) });
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
  const tm = seasonTeams(r) ?? r.teamOf;
  if (tm) for (const [pid, L] of Object.entries(tm)) if (r.players.some((p) => p.id === pid)) get(L).members.push(pid);
  for (const m of matches) {
    if (!countsForTeams(r, m)) continue;
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
  return totals.length >= 2 && matches.some((m) => countsForTeams(r, m)) ? totals : null;
}

/** Who's ahead in a match still being played: 'a', 'b', 'square', or null if it hasn't started. */
function liveLeader(res: GameResult | { error: string } | undefined): 'a' | 'b' | 'square' | null {
  if (!res || 'error' in res || res.finished) return null;
  const lead =
    res.type === 'matchPlay' ? (res.status.thru ? res.status.lead : null)
    : res.type === 'nassau' ? (res.thru ? res.points.A - res.points.B : null)
    : res.type === 'vegas' ? (res.thru ? res.totalA : null)
    : (res.type === 'scramble' || res.type === 'shamble') && res.match ? (res.match.thru ? res.match.lead : null)
    : null;
  if (lead === null) return null;
  return lead > 0 ? 'a' : lead < 0 ? 'b' : 'square';
}

export interface LiveTeamScore {
  /** Points already won, per team letter (finished matches only). */
  teams: (TeamTotal & { leading: number; projected: number })[];
  /** Matches still being played that are level. */
  square: number;
  live: number;
}

/**
 * The round's team match as it stands: points from finished matches, plus who's ahead in the ones still
 * being played (a leading match counts a full point toward the projection, a level one half each).
 */
export function liveTeamScore(r: RoundRecord, results: (GameResult | { error: string })[]): LiveTeamScore | null {
  const matches = matchOutcomes(r, results).filter((m) => countsForTeams(r, m));
  if (matches.length === 0) return null;
  const totals = teamTotals(r, matches).map((t) => ({ ...t, leading: 0, projected: t.points }));
  const get = (L: string) => totals.find((t) => t.letter === L);
  let square = 0;
  let live = 0;
  for (const m of matches) {
    if (m.winner) continue;
    const lead = liveLeader(results[m.gi]);
    if (lead === null) continue;
    live++;
    const ta = get(m.a.letter);
    const tb = get(m.b.letter);
    if (lead === 'a' && ta) { ta.leading++; ta.projected += 1; }
    else if (lead === 'b' && tb) { tb.leading++; tb.projected += 1; }
    else { square++; if (ta) ta.projected += 0.5; if (tb) tb.projected += 0.5; }
  }
  return totals.length >= 2 ? { teams: totals.sort((x, y) => x.letter.localeCompare(y.letter)), square, live } : null;
}

/** For match cards: each side's team (name and colour), when the round has teams. */
export function cardSides(
  r: RoundRecord,
  results: (GameResult | { error: string })[],
  teamName: (letter: string) => string,
  colorOf: (letter: string) => string,
): Record<number, [{ team: string; names: string; color: string }, { team: string; names: string; color: string }]> {
  if (!r.teamOf || Object.keys(r.teamOf).length === 0) return {};
  const out: Record<number, [{ team: string; names: string; color: string }, { team: string; names: string; color: string }]> = {};
  const first = (id: string) => (r.players.find((p) => p.id === id)?.name ?? '').split(' ')[0];
  for (const m of matchOutcomes(r, results)) {
    if (m.a.letter === m.b.letter) continue;
    out[m.gi] = [
      { team: teamName(m.a.letter), names: m.a.members.map(first).join(' & '), color: colorOf(m.a.letter) },
      { team: teamName(m.b.letter), names: m.b.members.map(first).join(' & '), color: colorOf(m.b.letter) },
    ];
  }
  return out;
}
