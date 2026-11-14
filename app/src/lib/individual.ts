/**
 * Individual Points seasons: every finished game in every round of the event adds to each player's own total.
 * Matches pay win / halve / loss points to everyone on the side (a Nassau pays its own points); every other game
 * pays points by finishing place from the event's place table.
 */
import { individualStandings, placePoints, type GameResult, type IndividualItem, type IndividualRow } from '@golf/engine';

import { gameName } from '@/lib/games';
import { matchOutcomes } from '@/lib/results';
import { evaluate, isResult } from '@/lib/round';
import type { EventRecord, RoundRecord } from '@/store/store';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** What each player earned in one round. */
export function roundItems(e: EventRecord, r: RoundRecord, results: ReturnType<typeof evaluate> = evaluate(r)): Record<string, IndividualItem[]> {
  const out: Record<string, IndividualItem[]> = {};
  const add = (id: string, item: IndividualItem) => (out[id] ??= []).push(item);
  const places = e.individual?.places ?? [];
  const matches = matchOutcomes(r, results);
  const inMatch = new Set(matches.map((m) => m.gi));
  // Matches: everyone on a side gets the side's points.
  for (const m of matches) {
    if (!m.winner) continue;
    const res = results[m.gi] as GameResult;
    const nassau = res.type === 'nassau';
    const pts = (side: 'a' | 'b') =>
      nassau ? (side === 'a' ? m.pointsA : m.pointsB) : m.winner === 'halved' ? e.points.halve : m.winner === side ? e.points.win : e.points.loss;
    for (const side of ['a', 'b'] as const) {
      const result = m.winner === 'halved' ? 'halved' : m.winner === side ? 'won' : 'lost';
      for (const id of m[side].members) add(id, { roundId: r.id, game: gameName(r.games[m.gi]), kind: 'match', result, detail: m.detail, points: pts(side) });
    }
  }
  // Everything else: points for where you finished.
  r.games.forEach((g, gi) => {
    const res = results[gi];
    if (inMatch.has(gi) || !res || !isResult(res) || !res.finished || !res.standings.length) return;
    const members = (id: string) => (g.type === 'scramble' || g.type === 'shamble' ? g.teams.find((t) => t.id === id)?.members ?? [id] : [id]);
    const placed = placePoints(Object.fromEntries(res.standings.map((s) => [s.id, s.position])), places);
    const field = res.standings.length;
    for (const s of res.standings) {
      const p = placed[s.id];
      for (const id of members(s.id)) {
        add(id, { roundId: r.id, game: gameName(g), kind: 'place', result: null, place: p.place, tied: p.tied, detail: `${p.tied ? 'T' : ''}${ordinal(p.place)} of ${field}`, points: p.points });
      }
    }
  });
  return out;
}

export type IndividualRound = { round: RoundRecord; items: Record<string, IndividualItem[]> };

/** Every round in the event that has a finished game, oldest first, with what each player earned. */
export function individualRounds(e: EventRecord, rounds: RoundRecord[]): IndividualRound[] {
  return rounds
    .filter((r) => r.eventId === e.id)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((round) => ({ round, items: roundItems(e, round) }))
    .filter((x) => Object.keys(x.items).length > 0);
}

export function individualTable(e: EventRecord, rounds: RoundRecord[]): IndividualRow[] {
  const all: Record<string, IndividualItem[]> = {};
  for (const x of individualRounds(e, rounds)) for (const [id, list] of Object.entries(x.items)) (all[id] ??= []).push(...list);
  return individualStandings(all, e.playerIds);
}

/** 2.5 → "2½", 0.17 → "0.17". */
export function fmtIndividual(n: number): string {
  const r = Math.round(n * 100) / 100;
  const whole = Math.floor(r);
  if (r - whole === 0.5) return whole === 0 ? '½' : `${whole}½`;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, '');
}
