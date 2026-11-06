import type { GameResult, HoleOutcome } from '@golf/engine';

import type { RoundRecord } from '@/store/store';
import type { Colors } from '@/theme';
import type { MatchOutcome } from './results';
import { grossAt, teeFor, gameHoles } from './round';
import { teamGroups, teamHole } from './teams';

export interface StoryHole {
  hole: number;
  par: number;
  /** The score that counted for each side (net when handicaps are on). */
  a: number | null;
  b: number | null;
  /** +1 side A won the hole, -1 side B, 0 halved, null not played. */
  outcome: HoleOutcome;
  /** Side A's lead after this hole (null if not played). */
  lead: number | null;
  /** Players who made birdie or better (gross) on the hole. */
  birdies: string[];
}

/** Hole-by-hole facts for one match: what each side scored, who won it, and the running status. */
export function storyHoles(r: RoundRecord, res: GameResult | undefined, m: MatchOutcome, c: Colors): StoryHole[] {
  if (!res) return [];
  const status = res.type === 'matchPlay' ? res.status : res.type === 'nassau' ? res.segments[2].status : (res.type === 'scramble' || res.type === 'shamble') && res.match ? res.match : null;
  const g = r.games[m.gi];
  // Holes in the order they were played (a match can be 9 holes, or start on hole 10 or any hole).
  const order = res.holeOrder ?? gameHoles(g);
  // Holes after the match was closed out don't count.
  const outcomes: (HoleOutcome | null)[] = order.map((h, i) => (status?.closedOutOnHole && i + 1 > status.closedOutOnHole ? null : (status?.outcomes[h - 1] ?? null)));
  const net = g.handicap?.net !== false;
  const teams = teamGroups(r, c, m.gi);
  const name = (id: string) => r.players.find((p) => p.id === id)?.name.split(' ')[0] ?? id;
  const sideScore = (which: 0 | 1, members: string[], h: number): number | null => {
    if (teams?.[which]) return teamHole(r, res, teams[which], h, m.gi).score;
    const id = members[0];
    const gross = grossAt(r, id, h);
    return gross === null ? null : net ? gross - (res.strokes[id]?.[h - 1] ?? 0) : gross;
  };
  const keys = [...new Set([...m.a.members, ...m.b.members, ...(teams?.flatMap((t) => t.keys) ?? [])])];
  let lead = 0;
  return order.map((h, i) => {
    const o = outcomes[i] ?? null;
    if (o !== null) lead += o;
    const par = teeFor(r, m.a.members[0]).holes[h - 1].par;
    const birdies = keys.filter((k) => {
      const gross = grossAt(r, k, h);
      return gross !== null && gross < par && r.players.some((p) => p.id === k);
    }).map(name);
    return { hole: h, par, a: sideScore(0, m.a.members, h), b: sideScore(1, m.b.members, h), outcome: o, lead: o === null ? null : lead, birdies };
  });
}

const s = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** A short written story of the match, built from the hole-by-hole results. */
export function localStory(m: MatchOutcome, holes: StoryHole[]): string {
  const played = holes.filter((h) => h.outcome !== null);
  if (!played.length) return 'This match hasn’t started yet.';
  const A = m.a.names;
  const B = m.b.names;
  const verb = (names: string) => (names.includes('&') ? 'were' : 'was');
  const winsOf = (side: 1 | -1, list: StoryHole[]) => list.filter((h) => h.outcome === side).length;

  // Biggest lead each side had, and when.
  let maxA = 0, maxAHole = 0, maxB = 0, maxBHole = 0;
  for (const h of played) {
    if (h.lead! > maxA) { maxA = h.lead!; maxAHole = h.hole; }
    if (-h.lead! > maxB) { maxB = -h.lead!; maxBHole = h.hole; }
  }
  // "The turn" only exists in an 18-hole match; the back nine is the second nine played.
  const turn = holes.length > 9 ? holes[8].lead : null;
  const back = holes.length > 9 ? played.filter((h) => holes.indexOf(h) >= 9) : [];
  const last = played[played.length - 1];
  const parts: string[] = [];

  if (m.winner === 'a' || m.winner === 'b') {
    const aWon = m.winner === 'a';
    const W = aWon ? A : B;
    const L = aWon ? B : A;
    const deficit = aWon ? maxB : maxA;
    const deficitHole = aWon ? maxBHole : maxAHole;
    const sign = aWon ? 1 : -1;
    const backWins = winsOf(sign as 1 | -1, back);
    if (deficit > 0) {
      parts.push(`${W} ${verb(W)} ${deficit} down after the ${ordinal(deficitHole)} but fought back${back.length > 1 && backWins > 1 ? `, winning ${backWins} of ${back.length} holes on the ${holes[0]?.hole === 1 ? 'back' : 'second'} nine,` : ''} to take the match ${m.detail}.`);
    } else if (turn !== null && turn * sign > 0) {
      parts.push(`${W} led from the start, made the turn ${Math.abs(turn)} up and never let ${L} back in, closing it out ${m.detail} on the ${ordinal(last.hole)}.`);
    } else {
      parts.push(`${W} took control and won ${m.detail}, closing it out on the ${ordinal(last.hole)}.`);
    }
  } else if (m.winner === 'halved') {
    const swings = played.filter((h, i) => i > 0 && Math.sign(h.lead!) !== 0 && Math.sign(h.lead!) !== Math.sign(played[i - 1].lead!)).length;
    parts.push(`Nothing between them. ${maxA ? `${A} led by as many as ${maxA}` : ''}${maxA && maxB ? ' and ' : ''}${maxB ? `${B} by as many as ${maxB}` : ''}${maxA || maxB ? ', but' : ''} the match finished all square${swings > 1 ? ` after ${s(swings, 'lead change')}` : ''}.`);
  } else {
    const leadNow = last.lead!;
    parts.push(leadNow === 0 ? `All square through ${played.length}.` : `${leadNow > 0 ? A : B} ${verb(leadNow > 0 ? A : B)} ${Math.abs(leadNow)} up through ${played.length}.`);
  }

  // A key moment: the last birdie that won a hole for the eventual winner (or anyone).
  const winSide = m.winner === 'a' ? 1 : m.winner === 'b' ? -1 : null;
  const key = [...played].reverse().find((h) => h.birdies.length && h.outcome !== 0 && (winSide === null || h.outcome === winSide));
  if (key) parts.push(key.birdies.length === 1 ? `${key.birdies[0]}'s birdie on the ${ordinal(key.hole)} was the big moment.` : `Birdies from ${key.birdies.join(' and ')} on the ${ordinal(key.hole)} were the big moment.`);
  return parts.join(' ');
}
