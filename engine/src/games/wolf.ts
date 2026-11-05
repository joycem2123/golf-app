import { DEFAULT_ALLOWANCES } from '../handicap';
import { bestOf, findPlayer, individualBook, rankStandings, settingsWith } from '../scoring';
import type { BaseResult, HandicapSettings, Round } from '../types';

/**
 * partner: wolf picks a partner after seeing tee shots.
 * lone:    wolf plays alone against everyone (decided after tee shots).
 * blind:   wolf goes alone before anyone tees off.
 */
export type WolfMode = 'partner' | 'lone' | 'blind';

export interface WolfDecision {
  mode: WolfMode;
  partnerId?: string;
}

export interface WolfPoints {
  /** Each of wolf + partner when they win the hole. */
  wolfTeamWin: number;
  /** Each opponent when they beat the wolf + partner. */
  opponentsWin: number;
  /** Wolf alone beats everyone. */
  loneWolfWin: number;
  /** Each opponent when the lone wolf loses. */
  loneWolfLoss: number;
  blindWolfWin: number;
  blindWolfLoss: number;
}

export const DEFAULT_WOLF_POINTS: WolfPoints = {
  wolfTeamWin: 2,
  opponentsWin: 3,
  loneWolfWin: 4,
  loneWolfLoss: 1,
  blindWolfWin: 6,
  blindWolfLoss: 2,
};

export interface WolfConfig {
  type: 'wolf';
  id?: string;
  title?: string;
  /** Tee order on hole 1 (3 or 4 players). The wolf rotates through it. */
  order: string[];
  /** One decision per hole (index 0 = hole 1); null/missing = not decided yet. */
  decisions: (WolfDecision | null)[];
  points?: Partial<WolfPoints>;
  /** Tied holes: no points, or carry (next hole is worth double, triple, ...). */
  ties?: 'noPoints' | 'carryover';
  /**
   * 4-player wolf only: 16 holes rotate evenly, so on holes 17 & 18 the wolf is
   * either the player in last place ('lowestPoints') or the rotation continues ('rotation').
   */
  lastHoles?: 'lowestPoints' | 'rotation';
  handicap?: Partial<HandicapSettings>;
}

export interface WolfHole {
  hole: number;
  wolfId: string;
  decision: WolfDecision | null;
  result: 'wolfSide' | 'opponents' | 'tie' | null;
  multiplier: number;
  points: Record<string, number>;
}

export interface WolfResult extends BaseResult {
  type: 'wolf';
  holes: WolfHole[];
  points: Record<string, number>;
  /** Who is the wolf on the next hole to play (null after the round). */
  nextWolfId: string | null;
}

function wolfFor(i: number, order: string[], points: Record<string, number>, cfg: WolfConfig, holeCount: number) {
  const n = order.length;
  const rotationHoles = holeCount - (holeCount % n);
  if (n === 4 && i >= rotationHoles && (cfg.lastHoles ?? 'lowestPoints') === 'lowestPoints') {
    // Player in last place is the wolf; ties go to whoever is earliest in the tee order.
    const low = Math.min(...order.map((id) => points[id]));
    return order.find((id) => points[id] === low)!;
  }
  return order[i % n];
}

export function playWolf(round: Round, cfg: WolfConfig): WolfResult {
  const order = cfg.order;
  if (order.length !== 3 && order.length !== 4) throw new Error('Wolf supports 3 or 4 players');
  const settings = settingsWith({ allowance: DEFAULT_ALLOWANCES.wolf, mode: 'offLow', net: true }, cfg.handicap);
  const pts = { ...DEFAULT_WOLF_POINTS, ...cfg.points };
  const { book } = individualBook(round, order, settings);
  const points: Record<string, number> = Object.fromEntries(order.map((id) => [id, 0]));
  const holes: WolfHole[] = [];
  let multiplier = 1;
  let thru = 0;

  for (let i = 0; i < book.holeCount; i++) {
    const wolfId = wolfFor(i, order, points, cfg, book.holeCount);
    const decision = cfg.decisions[i] ?? null;
    const scored = order.every((id) => book.gross(id, i) !== null);
    if (!decision || !scored) {
      holes.push({ hole: i + 1, wolfId, decision, result: null, multiplier, points: {} });
      break;
    }
    if (decision.mode === 'partner') {
      if (!decision.partnerId || decision.partnerId === wolfId || !order.includes(decision.partnerId)) {
        throw new Error(`Hole ${i + 1}: wolf needs a valid partner`);
      }
    }
    const wolfSide = decision.mode === 'partner' ? [wolfId, decision.partnerId!] : [wolfId];
    const others = order.filter((id) => !wolfSide.includes(id));
    const ws = bestOf(book, wolfSide, i, settings.net)!;
    const os = bestOf(book, others, i, settings.net)!;
    const holePts: Record<string, number> = {};
    const give = (ids: string[], p: number) => ids.forEach((id) => (holePts[id] = p * multiplier));
    let result: WolfHole['result'];

    if (ws < os) {
      result = 'wolfSide';
      if (decision.mode === 'partner') give(wolfSide, pts.wolfTeamWin);
      else give([wolfId], decision.mode === 'blind' ? pts.blindWolfWin : pts.loneWolfWin);
    } else if (os < ws) {
      result = 'opponents';
      if (decision.mode === 'partner') give(others, pts.opponentsWin);
      else give(others, decision.mode === 'blind' ? pts.blindWolfLoss : pts.loneWolfLoss);
    } else {
      result = 'tie';
    }

    holes.push({ hole: i + 1, wolfId, decision, result, multiplier, points: holePts });
    for (const [id, p] of Object.entries(holePts)) points[id] += p;
    multiplier = result === 'tie' && cfg.ties === 'carryover' ? multiplier + 1 : 1;
    thru = i + 1;
  }

  const finished = thru === book.holeCount;
  const standings = rankStandings(
    order.map((id) => ({ id, name: findPlayer(round, id).name, value: points[id], thru })),
    'high',
  );
  const leaders = standings.filter((s) => s.position === 1);
  const names = leaders.map((l) => l.name).join(' & ');
  const summary =
    thru === 0
      ? 'Not started'
      : `${names} ${finished ? (leaders.length > 1 ? 'tie' : 'wins') : 'leads'} with ${leaders[0].value} pts`;

  return {
    type: 'wolf',
    title: cfg.title ?? 'Wolf',
    finished,
    thru,
    winnerIds: finished ? leaders.map((l) => l.id) : [],
    summary,
    postingEligible: true,
    standings,
    holes,
    points,
    nextWolfId: finished ? null : wolfFor(thru, order, points, cfg, book.holeCount),
  };
}
