import { DEFAULT_ALLOWANCES } from '../handicap';
import { findPlayer, individualBook, rankStandings, settingsWith } from '../scoring';
import type { BaseResult, HandicapSettings, Round } from '../types';

/**
 * Validation: after winning a skin outright, the winner must "validate" it on
 * the next hole or it carries over.
 *  - none:        skins are won immediately
 *  - tieOrBetter: winner must tie or beat everyone on the next hole
 *  - parOrBetter: winner must make par or better on the next hole (net or gross, matching the game)
 * The last hole never needs validating.
 */
export type SkinsValidation = 'none' | 'tieOrBetter' | 'parOrBetter';

export interface SkinsConfig {
  type: 'skins';
  id?: string;
  title?: string;
  playerIds: string[];
  /** Tied holes carry their skins to the next hole (otherwise nobody wins them). */
  carryovers?: boolean;
  validation?: SkinsValidation;
  /** Set handicap.net = false for gross skins. */
  handicap?: Partial<HandicapSettings>;
}

export type SkinHoleStatus = 'won' | 'carried' | 'nobody' | 'pending' | 'notValidated';

export interface SkinHole {
  hole: number;
  status: SkinHoleStatus;
  winnerId: string | null;
  /** Skins at stake (or won) on this hole. */
  value: number;
}

export interface SkinsResult extends BaseResult {
  type: 'skins';
  holes: SkinHole[];
  skins: Record<string, number>;
  /** Skins carried past the last hole that nobody won. */
  unclaimed: number;
}

export function playSkins(round: Round, cfg: SkinsConfig): SkinsResult {
  if (cfg.playerIds.length < 2) throw new Error('Skins needs at least 2 players');
  const settings = settingsWith({ allowance: DEFAULT_ALLOWANCES.skins, mode: 'offLow', net: true }, cfg.handicap);
  const validation = cfg.validation ?? 'none';
  const carryovers = cfg.carryovers ?? true;
  const { book } = individualBook(round, cfg.playerIds, settings);
  const ids = cfg.playerIds;
  const last = book.holeCount - 1;

  const skins: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  const holes: SkinHole[] = [];
  let carry = 0;
  let pending: { holeIdx: number; winnerId: string; value: number } | null = null;
  let thru = 0;

  for (let i = 0; i <= last; i++) {
    const scores = ids.map((id) => book.score(id, i, settings.net));
    if (scores.some((s) => s === null)) break;
    const vals = scores as number[];
    thru = i + 1;

    // 1. Validate the skin won on the previous hole.
    if (pending) {
      const w = ids.indexOf(pending.winnerId);
      const others = vals.filter((_, k) => k !== w);
      const ok =
        validation === 'tieOrBetter'
          ? vals[w] <= Math.min(...others)
          : vals[w] <= book.par(pending.winnerId, i);
      const prev = holes[pending.holeIdx];
      if (ok) {
        prev.status = 'won';
        skins[pending.winnerId] += pending.value;
      } else {
        prev.status = 'notValidated';
        carry += pending.value;
      }
      pending = null;
    }

    // 2. Resolve this hole.
    const value = 1 + carry;
    carry = 0;
    const low = Math.min(...vals);
    const winners = ids.filter((_, k) => vals[k] === low);
    if (winners.length === 1) {
      const winnerId = winners[0];
      if (validation !== 'none' && i < last) {
        pending = { holeIdx: i, winnerId, value };
        holes.push({ hole: i + 1, status: 'pending', winnerId, value });
      } else {
        skins[winnerId] += value;
        holes.push({ hole: i + 1, status: 'won', winnerId, value });
      }
    } else if (carryovers) {
      carry = value;
      holes.push({ hole: i + 1, status: 'carried', winnerId: null, value });
    } else {
      holes.push({ hole: i + 1, status: 'nobody', winnerId: null, value });
    }
  }

  const finished = thru === book.holeCount;
  const standings = rankStandings(
    ids.map((id) => ({ id, name: findPlayer(round, id).name, value: skins[id], thru })),
    'high',
  );
  const top = standings[0];
  const leaders = standings.filter((s) => s.value === top.value && s.value > 0);
  const totalWon = Object.values(skins).reduce((s, v) => s + v, 0);
  const summary =
    totalWon === 0
      ? thru === 0 ? 'Not started' : `No skins won yet (${carry} carrying)`
      : `${leaders.map((l) => l.name).join(' & ')} ${finished ? (leaders.length > 1 ? 'tie' : 'wins') : 'leads'} with ${top.value} skin${top.value === 1 ? '' : 's'}`;

  return {
    type: 'skins',
    title: cfg.title ?? `${settings.net ? 'Net' : 'Gross'} skins`,
    finished,
    thru,
    winnerIds: finished ? leaders.map((l) => l.id) : [],
    summary,
    postingEligible: true,
    standings,
    holes,
    skins,
    unclaimed: finished ? carry : 0,
  };
}
