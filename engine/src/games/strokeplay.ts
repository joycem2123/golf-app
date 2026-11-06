import { adjustForMode, courseHandicap, DEFAULT_ALLOWANCES, scrambleTeamHandicap } from '../handicap';
import { compareScores, scoreMatch, type MatchStatus } from '../matchplay';
import {
  bestNSum,
  findPlayer,
  findTee,
  individualBook,
  rankStandings,
  ScoreBook,
  settingsWith,
  sideName,
  wins,
} from '../scoring';
import type { BaseResult, HandicapSettings, Round, Side, Standing } from '../types';

export interface StrokeTotals {
  thru: number;
  gross: number;
  net: number;
  /** Net (or gross, if the game is gross) relative to par for holes completed. */
  toPar: number;
  handicap: number;
}

export interface StrokeResult extends BaseResult {
  type: 'scramble' | 'shamble' | 'strokePlay';
  totals: Record<string, StrokeTotals>;
  /**
   * Two-team scramble or shamble: also played as a match, hole by hole (lower team score wins the hole).
   * The match decides the winner; totals to par are still kept.
   */
  match?: MatchStatus;
  /** The two teams in the match, side A first. */
  matchSides?: [{ id: string; name: string }, { id: string; name: string }];
}

function formatToPar(n: number) {
  return n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`;
}

function finish(
  round: Round,
  type: 'scramble' | 'shamble' | 'strokePlay',
  title: string,
  entries: Side[],
  totals: Record<string, StrokeTotals>,
  holeCount: number,
  postingEligible: boolean,
  book: ScoreBook,
  /** The team's counting score on a hole (net or gross, per the game), for the two-team match. */
  holeValue?: (id: string, i: number) => number | null,
): StrokeResult {
  const standings: Standing[] = rankStandings(
    entries.map((e) => ({ id: e.id, name: sideName(round, e), value: totals[e.id].toPar, thru: totals[e.id].thru })),
    'low',
  );
  const thru = Math.min(...entries.map((e) => totals[e.id].thru));
  const finished = thru === holeCount;
  const leaders = standings.filter((s) => s.position === 1);
  const names = leaders.map((l) => l.name).join(' & ');
  const at = formatToPar(leaders[0].value);
  const summary =
    Math.max(...entries.map((e) => totals[e.id].thru)) === 0
      ? 'Not started'
      : leaders.length > 1
        ? `${finished ? 'Tie' : 'Tied'} at ${at}: ${leaders.map((l) => l.name).join(' / ')}`
        : `${names} ${finished ? wins(names) : names.includes(' & ') ? 'lead' : 'leads'} at ${at}`;
  if (holeValue && entries.length === 2) {
    const [a, b] = entries;
    const match = scoreMatch(Array.from({ length: holeCount }, (_, i) => compareScores(holeValue(a.id, i), holeValue(b.id, i))));
    const nameA = sideName(round, a);
    const nameB = sideName(round, b);
    const leader = match.lead > 0 ? nameA : nameB;
    const matchSummary =
      match.thru === 0
        ? 'Not started'
        : match.finished
          ? match.winner === 'halved'
            ? 'Match halved'
            : `${leader} ${wins(leader)} ${match.display}`
          : match.lead === 0
            ? match.display
            : `${leader} ${match.display}`;
    return {
      type,
      title,
      finished: match.finished,
      thru: match.thru,
      winnerIds: match.winner === 'A' ? [a.id] : match.winner === 'B' ? [b.id] : [],
      summary: matchSummary,
      postingEligible,
      standings,
      strokes: book.strokeMap(),
      totals,
      match,
      matchSides: [{ id: a.id, name: nameA }, { id: b.id, name: nameB }],
    };
  }
  return {
    type,
    title,
    finished,
    thru,
    winnerIds: finished ? leaders.map((l) => l.id) : [],
    summary,
    postingEligible,
    standings,
    strokes: book.strokeMap(),
    totals,
  };
}

/** Totals for one scorecard (or a team's combined best-N card) over every completed hole (groups may start on different holes). */
function totalsFor(
  holeCount: number,
  holeScore: (i: number, net: boolean) => number | null,
  holePar: (i: number) => number,
  net: boolean,
  handicap: number,
): StrokeTotals {
  let thru = 0;
  let gross = 0;
  let netSum = 0;
  let par = 0;
  for (let i = 0; i < holeCount; i++) {
    if (holeScore(i, false) === null) continue;
    thru++;
    gross += holeScore(i, false)!;
    netSum += holeScore(i, true)!;
    par += holePar(i);
  }
  return { thru, gross, net: netSum, toPar: (net ? netSum : gross) - par, handicap };
}

// ---------------------------------------------------------------- scramble

export interface ScrambleConfig {
  type: 'scramble';
  id?: string;
  title?: string;
  /** team.id is the scorecard key for the team's single score. */
  teams: Side[];
  /** Override the team handicap percentages (lowest handicap first). */
  percentages?: number[];
  handicap?: Partial<Pick<HandicapSettings, 'mode' | 'net'>>;
}

export function playScramble(round: Round, cfg: ScrambleConfig): StrokeResult {
  const settings = { mode: 'full' as const, net: true, ...cfg.handicap };
  const team: Record<string, number> = {};
  for (const t of cfg.teams) {
    const chs = t.members.map((id) => {
      const p = findPlayer(round, id);
      return courseHandicap(p.handicapIndex, findTee(round, p.teeId));
    });
    team[t.id] = scrambleTeamHandicap(chs, cfg.percentages);
  }
  const adj = adjustForMode(team, settings.mode);
  const book = new ScoreBook(
    round,
    cfg.teams.map((t) => ({ key: t.id, teeId: findPlayer(round, t.members[0]).teeId, handicap: adj[t.id] })),
  );
  const totals: Record<string, StrokeTotals> = {};
  for (const t of cfg.teams) {
    totals[t.id] = totalsFor(
      book.holeCount,
      (i, net) => book.score(t.id, i, net),
      (i) => book.par(t.id, i),
      settings.net,
      adj[t.id],
    );
  }
  return finish(round, 'scramble', cfg.title ?? 'Scramble', cfg.teams, totals, book.holeCount, false, book, (id, i) => book.score(id, i, settings.net));
}

// ---------------------------------------------------------------- shamble

export interface ShambleConfig {
  type: 'shamble';
  id?: string;
  title?: string;
  /** Everyone plays their own ball after the chosen drive; team score = best N per hole. */
  teams: Side[];
  countBest?: number;
  handicap?: Partial<HandicapSettings>;
}

export function playShamble(round: Round, cfg: ShambleConfig): StrokeResult {
  const settings = settingsWith({ allowance: DEFAULT_ALLOWANCES.shamble, mode: 'offLow', net: true }, cfg.handicap);
  const ids = cfg.teams.flatMap((t) => t.members);
  const { book, handicaps } = individualBook(round, ids, settings);
  const totals: Record<string, StrokeTotals> = {};
  for (const t of cfg.teams) {
    const n = Math.min(cfg.countBest ?? 1, t.members.length);
    totals[t.id] = totalsFor(
      book.holeCount,
      (i, net) => bestNSum(t.members.map((m) => book.score(m, i, net)), n),
      (i) => book.par(t.members[0], i) * n,
      settings.net,
      t.members.reduce((s, m) => s + handicaps[m].matchHandicap, 0),
    );
  }
  const best = (id: string, i: number) => {
    const t = cfg.teams.find((x) => x.id === id)!;
    return bestNSum(t.members.map((m) => book.score(m, i, settings.net)), Math.min(cfg.countBest ?? 1, t.members.length));
  };
  return finish(round, 'shamble', cfg.title ?? 'Shamble', cfg.teams, totals, book.holeCount, false, book, best);
}

// ---------------------------------------------------------------- individual stroke play

export interface StrokePlayConfig {
  type: 'strokePlay';
  id?: string;
  title?: string;
  playerIds: string[];
  handicap?: Partial<HandicapSettings>;
}

export function playStrokePlay(round: Round, cfg: StrokePlayConfig): StrokeResult {
  const settings = settingsWith({ allowance: DEFAULT_ALLOWANCES.strokePlay, mode: 'full', net: true }, cfg.handicap);
  const { book, handicaps } = individualBook(round, cfg.playerIds, settings);
  const entries = cfg.playerIds.map((id) => ({ id, members: [id] }));
  const totals: Record<string, StrokeTotals> = {};
  for (const id of cfg.playerIds) {
    totals[id] = totalsFor(
      book.holeCount,
      (i, net) => book.score(id, i, net),
      (i) => book.par(id, i),
      settings.net,
      handicaps[id].matchHandicap,
    );
  }
  return finish(round, 'strokePlay', cfg.title ?? 'Stroke play', entries, totals, book.holeCount, true, book);
}
