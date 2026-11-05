import { adjustForMode, courseHandicap, DEFAULT_ALLOWANCES, foursomesTeamHandicap } from '../handicap';
import { compareScores, scoreMatch, type HoleOutcome, type MatchStatus } from '../matchplay';
import {
  bestOf,
  findPlayer,
  findTee,
  individualBook,
  ScoreBook,
  settingsWith,
  sideName,
} from '../scoring';
import type { BaseResult, HandicapSettings, PlayerHandicap, Round, Side } from '../types';

/** singles = 1 v 1; fourBall = best ball 2 v 2; foursomes = alternate shot 2 v 2. */
export type MatchFormat = 'singles' | 'fourBall' | 'foursomes';

export const MATCH_DEFAULTS: Record<MatchFormat, HandicapSettings> = {
  singles: { allowance: DEFAULT_ALLOWANCES.singlesMatch, mode: 'offLow', net: true },
  fourBall: { allowance: DEFAULT_ALLOWANCES.fourBallMatch, mode: 'offLow', net: true },
  foursomes: { allowance: DEFAULT_ALLOWANCES.foursomes, mode: 'offLow', net: true },
};

const FORMAT_LABEL: Record<MatchFormat, string> = {
  singles: 'Singles match',
  fourBall: 'Best ball match',
  foursomes: 'Alternate shot match',
};

export interface MatchPlayConfig {
  type: 'matchPlay';
  id?: string;
  title?: string;
  format: MatchFormat;
  /**
   * For foursomes, side.id is the team's scorecard key (one ball per team);
   * members are used to work out the team handicap.
   */
  sideA: Side;
  sideB: Side;
  handicap?: Partial<HandicapSettings>;
}

export interface MatchOutcomes {
  outcomes: HoleOutcome[];
  holeCount: number;
  /** Keyed by player id (singles/fourBall) or team id (foursomes). */
  handicaps: Record<string, PlayerHandicap>;
  book: ScoreBook;
  settings: HandicapSettings;
}

function checkSize(format: MatchFormat, side: Side) {
  const n = side.members.length;
  const ok = format === 'singles' ? n === 1 : format === 'foursomes' ? n === 2 : n >= 1 && n <= 2;
  if (!ok) throw new Error(`${FORMAT_LABEL[format]}: side "${side.id}" has ${n} players`);
}

/** Hole-by-hole outcomes for a match between two sides. Shared by match play, Nassau and presses. */
export function buildMatchOutcomes(
  round: Round,
  format: MatchFormat,
  sideA: Side,
  sideB: Side,
  partial?: Partial<HandicapSettings>,
): MatchOutcomes {
  checkSize(format, sideA);
  checkSize(format, sideB);
  const settings = settingsWith(MATCH_DEFAULTS[format], partial);

  if (format === 'foursomes') {
    const combined: Record<string, number> = {};
    const team: Record<string, number> = {};
    for (const side of [sideA, sideB]) {
      const chs = side.members.map((id) => {
        const p = findPlayer(round, id);
        return courseHandicap(p.handicapIndex, findTee(round, p.teeId));
      });
      combined[side.id] = chs.reduce((s, c) => s + c, 0);
      team[side.id] = foursomesTeamHandicap(chs, settings.allowance);
    }
    const adj = adjustForMode(team, settings.mode);
    const book = new ScoreBook(
      round,
      [sideA, sideB].map((s) => ({
        key: s.id,
        teeId: findPlayer(round, s.members[0]).teeId,
        handicap: adj[s.id],
      })),
    );
    const outcomes = Array.from({ length: book.holeCount }, (_, i) =>
      compareScores(book.score(sideA.id, i, settings.net), book.score(sideB.id, i, settings.net)),
    );
    const handicaps: Record<string, PlayerHandicap> = {};
    for (const s of [sideA, sideB]) {
      handicaps[s.id] = {
        courseHandicap: combined[s.id],
        playingHandicap: team[s.id],
        matchHandicap: adj[s.id],
      };
    }
    return { outcomes, holeCount: book.holeCount, handicaps, book, settings };
  }

  const { book, handicaps } = individualBook(round, [...sideA.members, ...sideB.members], settings);
  const outcomes = Array.from({ length: book.holeCount }, (_, i) =>
    compareScores(
      bestOf(book, sideA.members, i, settings.net),
      bestOf(book, sideB.members, i, settings.net),
    ),
  );
  return { outcomes, holeCount: book.holeCount, handicaps, book, settings };
}

export function matchSummary(nameA: string, nameB: string, s: MatchStatus): string {
  if (s.winner === 'halved') return `${nameA} and ${nameB} halved`;
  if (s.winner) return `${s.winner === 'A' ? nameA : nameB} wins ${s.display}`;
  if (s.thru === 0) return 'Not started';
  if (s.lead === 0) return s.display;
  const leader = s.lead > 0 ? nameA : nameB;
  return `${leader} ${s.display}${s.dormie ? ' (dormie)' : ''}`;
}

export interface MatchPlayResult extends BaseResult {
  type: 'matchPlay';
  format: MatchFormat;
  status: MatchStatus;
  sideA: { id: string; name: string };
  sideB: { id: string; name: string };
  handicaps: Record<string, PlayerHandicap>;
}

export function playMatch(round: Round, cfg: MatchPlayConfig): MatchPlayResult {
  const { outcomes, handicaps } = buildMatchOutcomes(round, cfg.format, cfg.sideA, cfg.sideB, cfg.handicap);
  const status = scoreMatch(outcomes);
  const nameA = sideName(round, cfg.sideA);
  const nameB = sideName(round, cfg.sideB);
  return {
    type: 'matchPlay',
    format: cfg.format,
    title: cfg.title ?? `${FORMAT_LABEL[cfg.format]}: ${nameA} vs ${nameB}`,
    finished: status.finished,
    thru: status.thru,
    winnerIds: status.winner === 'A' ? [cfg.sideA.id] : status.winner === 'B' ? [cfg.sideB.id] : [],
    summary: matchSummary(nameA, nameB, status),
    postingEligible: cfg.format !== 'foursomes',
    standings: [
      { id: cfg.sideA.id, name: nameA, value: status.lead, position: status.lead >= 0 ? 1 : 2, thru: status.thru },
      { id: cfg.sideB.id, name: nameB, value: -status.lead, position: status.lead <= 0 ? 1 : 2, thru: status.thru },
    ],
    status,
    sideA: { id: cfg.sideA.id, name: nameA },
    sideB: { id: cfg.sideB.id, name: nameB },
    handicaps,
  };
}

/** Side matches: one singles match per pair, played alongside the main game. */
export function singlesSideMatches(
  pairs: [string, string][],
  handicap?: Partial<HandicapSettings>,
): MatchPlayConfig[] {
  return pairs.map(([a, b]) => ({
    type: 'matchPlay',
    id: `side-${a}-${b}`,
    format: 'singles',
    sideA: { id: a, members: [a] },
    sideB: { id: b, members: [b] },
    handicap,
  }));
}
