/**
 * Core data types shared by the whole app.
 *
 * Hole numbers shown to golfers are 1-based (hole 1..18); arrays in the
 * engine are 0-based (index 0 = hole 1).
 */

export type PlayerId = string;

export interface Hole {
  number: number;
  par: number;
  /** Hole handicap / stroke index: 1 = hardest hole, 18 = easiest. */
  strokeIndex: number;
  yards?: number;
}

export interface Tee {
  id: string;
  name: string;
  gender?: 'M' | 'F';
  courseRating: number;
  slope: number;
  par: number;
  holes: Hole[];
}

export interface Course {
  id: string;
  name: string;
  city?: string;
  region?: string;
  country: string;
  tees: Tee[];
  /** Where the scorecard data came from. */
  source?: string;
  /** True once someone has checked it against the club's official scorecard. */
  verified?: boolean;
}

export interface Player {
  id: PlayerId;
  name: string;
  /** WHS Handicap Index. Plus handicaps are negative (e.g. +1.2 => -1.2). */
  handicapIndex: number;
  teeId: string;
}

/**
 * Gross strokes per hole (index 0 = hole 1). `null` = not entered yet.
 * Keyed by player id, or by team id for formats where a team records one
 * ball (alternate shot, scramble).
 */
export type Scorecard = Record<string, (number | null)[]>;

export interface Round {
  course: Course;
  players: Player[];
  scores: Scorecard;
}

/**
 * offLow: everyone plays off the lowest handicap in the game (low player gets 0).
 * full:   everyone receives their full playing handicap.
 */
export type HandicapMode = 'offLow' | 'full';

export interface HandicapSettings {
  /** Fraction of course handicap used (e.g. 0.9 for four-ball match play). */
  allowance: number;
  mode: HandicapMode;
  /** Score the game on net (true) or gross (false) scores. */
  net: boolean;
}

/** A player or team in a game. For team-card formats, `id` is the scorecard key. */
export interface Side {
  id: string;
  name?: string;
  members: PlayerId[];
}

export interface PlayerHandicap {
  courseHandicap: number;
  /** Course handicap with the allowance applied. */
  playingHandicap: number;
  /** Strokes actually received in this game (after strokes-off-low). */
  matchHandicap: number;
}

export interface Standing {
  id: string;
  name: string;
  /** Points, holes up, strokes etc. The meaning depends on the game. */
  value: number;
  position: number;
  thru: number;
}

export type GameType =
  | 'matchPlay'
  | 'nassau'
  | 'skins'
  | 'wolf'
  | 'vegas'
  | 'stableford'
  | 'scramble'
  | 'shamble'
  | 'strokePlay';

export interface BaseResult {
  type: GameType;
  title: string;
  finished: boolean;
  /** Holes completed so far in this game. */
  thru: number;
  /** Winning player/side ids. Empty while in progress or when halved/tied. */
  winnerIds: string[];
  /** One-line result for leaderboards, e.g. "Mike wins 3&2". */
  summary: string;
  /** Whether players should be reminded to post this round to Golf Canada. */
  postingEligible: boolean;
  standings: Standing[];
  /** Strokes received on each hole, keyed by player id (or team id for team-card formats). */
  strokes: Record<string, number[]>;
  /** Real hole numbers this game covers, in playing order (only set for 9 holes or a different start). */
  holeOrder?: number[];
}
