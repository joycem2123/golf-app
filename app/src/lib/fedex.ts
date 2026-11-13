/**
 * Points Race seasons in the app: each finished round's Stableford points, scored with the season's settings.
 */
import { fedexRounds, type FedexRound, type FedexRoundResult } from '@golf/engine';

import { toISODate } from '@/lib/dates';
import { evaluate } from '@/lib/round';
import type { EventRecord, RoundRecord } from '@/store/store';

/** The day a round was played: its planned date in the season, else the day it was started. */
export function roundDate(e: EventRecord, r: RoundRecord): string {
  return e.rounds?.find((x) => x.roundId === r.id)?.date ?? toISODate(new Date(r.createdAt));
}

/** The season's finished rounds, each with every player's Stableford points. */
export function seasonRounds(e: EventRecord, rounds: RoundRecord[]): FedexRound[] {
  const out: FedexRound[] = [];
  for (const r of rounds) {
    if (r.eventId !== e.id || r.status !== 'complete') continue;
    let res;
    try {
      res = evaluate(r);
    } catch {
      continue;
    }
    const stb = res.find((x) => x && 'type' in x && x.type === 'stableford');
    if (!stb || !('totals' in stb)) continue;
    const points: Record<string, number> = {};
    for (const [id, v] of Object.entries(stb.totals as Record<string, number>)) points[id] = v;
    if (Object.keys(points).length) out.push({ id: r.id, date: roundDate(e, r), order: r.createdAt, points });
  }
  return out;
}

export function fedexResults(e: EventRecord, rounds: RoundRecord[]): FedexRoundResult[] {
  return e.fedex ? fedexRounds(seasonRounds(e, rounds), e.fedex) : [];
}

/** Which half the season is in now. */
export function currentHalf(e: EventRecord, results: FedexRoundResult[]): 1 | 2 {
  if (!e.fedex) return 1;
  if (e.fedex.half.kind === 'date') return toISODate(new Date()) >= e.fedex.half.date ? 2 : 1;
  return results.length >= e.fedex.half.count ? 2 : 1;
}
