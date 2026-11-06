import type { RoundRecord } from '@/store/store';
import { grossAt, teeFor } from './round';

export interface PlayerRoundRow {
  round: RoundRecord;
  playerId: string;
  gross: number;
  holes: number;
  toPar: number;
  teeName: string;
}

export interface PlayerStats {
  rounds: number;
  average: number | null;
  best: number | null;
  rows: PlayerRoundRow[];
}

/** Score history for a player across finished rounds. `ids` covers players who are the same person (e.g. "Me" and aliases). */
export function playerStats(rounds: RoundRecord[], ids: string[]): PlayerStats {
  const rows: PlayerRoundRow[] = [];
  for (const r of rounds) {
    if (r.status !== 'complete') continue;
    const pid = r.players.find((p) => ids.includes(p.id))?.id;
    if (!pid) continue;
    const scores = Array.from({ length: 18 }, (_, i) => grossAt(r, pid, i + 1));
    const played = scores.filter((s): s is number => s !== null);
    if (!played.length) continue;
    const tee = teeFor(r, pid);
    const par = tee.holes.reduce((s, h, i) => s + (scores[i] !== null ? h.par : 0), 0);
    const gross = played.reduce((a, b) => a + b, 0);
    rows.push({ round: r, playerId: pid, gross, holes: played.length, toPar: gross - par, teeName: tee.name });
  }
  rows.sort((a, b) => b.round.createdAt - a.round.createdAt);
  const full = rows.filter((x) => x.holes === 18);
  return {
    rounds: rows.length,
    average: full.length ? Math.round((full.reduce((s, x) => s + x.gross, 0) / full.length) * 10) / 10 : null,
    best: full.length ? Math.min(...full.map((x) => x.gross)) : null,
    rows,
  };
}
