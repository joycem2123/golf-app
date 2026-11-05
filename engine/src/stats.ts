/** Optional per-hole stats (turned on during game setup). */
import type { Hole } from './types';

export type FairwayResult = 'hit' | 'left' | 'right' | 'short' | 'long';

export interface HoleStats {
  putts?: number;
  /** Only recorded on par 4s and 5s. */
  fairway?: FairwayResult;
  /** Calculated from score and putts if not entered. */
  gir?: boolean;
  penalties?: number;
}

/** Green in regulation: on the green in (par − 2) strokes or fewer. */
export function greenInRegulation(gross: number, putts: number, par: number): boolean {
  return gross - putts <= par - 2;
}

export interface RoundStats {
  holes: number;
  putts: number;
  puttsPerHole: number;
  fairwaysHit: number;
  fairwayAttempts: number;
  girHit: number;
  girAttempts: number;
  penalties: number;
  scoring: { eaglesOrBetter: number; birdies: number; pars: number; bogeys: number; doubleOrWorse: number };
}

export function summarizeStats(gross: (number | null)[], stats: (HoleStats | null | undefined)[], holes: Hole[]): RoundStats {
  const s: RoundStats = {
    holes: 0, putts: 0, puttsPerHole: 0, fairwaysHit: 0, fairwayAttempts: 0, girHit: 0, girAttempts: 0, penalties: 0,
    scoring: { eaglesOrBetter: 0, birdies: 0, pars: 0, bogeys: 0, doubleOrWorse: 0 },
  };
  let puttHoles = 0;
  holes.forEach((h, i) => {
    const g = gross[i];
    if (g == null) return;
    s.holes++;
    const d = g - h.par;
    if (d <= -2) s.scoring.eaglesOrBetter++;
    else if (d === -1) s.scoring.birdies++;
    else if (d === 0) s.scoring.pars++;
    else if (d === 1) s.scoring.bogeys++;
    else s.scoring.doubleOrWorse++;

    const st = stats[i];
    if (!st) return;
    if (st.putts != null) { s.putts += st.putts; puttHoles++; }
    if (h.par >= 4 && st.fairway) { s.fairwayAttempts++; if (st.fairway === 'hit') s.fairwaysHit++; }
    const gir = st.gir ?? (st.putts != null ? greenInRegulation(g, st.putts, h.par) : undefined);
    if (gir !== undefined) { s.girAttempts++; if (gir) s.girHit++; }
    s.penalties += st.penalties ?? 0;
  });
  s.puttsPerHole = puttHoles ? Math.round((s.putts / puttHoles) * 100) / 100 : 0;
  return s;
}
