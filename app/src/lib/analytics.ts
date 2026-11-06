import type { RecordedMatch } from '@golf/engine';

import type { RoundRecord } from '@/store/store';
import { courseFor, grossAt, shortCourseName, teeFor } from './round';

export interface TrendPoint {
  roundId: string;
  date: number;
  gross: number;
  toPar: number;
  course: string;
}

export interface ScoreTypes {
  eagle: number;
  birdie: number;
  par: number;
  bogey: number;
  double: number;
  holes: number;
}

export interface Analytics {
  rounds: number;
  holes: number;
  trend: TrendPoint[];
  types: ScoreTypes;
  /** Average strokes over par per hole, by hole par. */
  byPar: Record<3 | 4 | 5, { over: number | null; holes: number }>;
  /** Average strokes over par per nine (complete nines only). */
  nines: { front: number | null; back: number | null };
  /** Average over par per hole by hole difficulty (stroke index). */
  difficulty: { label: string; over: number | null; holes: number }[];
  stats: { putts: number | null; fir: number | null; gir: number | null; holesTracked: number };
  record: { wins: number; losses: number; halves: number };
}

const avg = (sum: number, n: number) => (n ? Math.round((sum / n) * 100) / 100 : null);

/** My scoring analytics across finished rounds. `ids` are the player ids that are me. */
export function myAnalytics(rounds: RoundRecord[], ids: string[], history: RecordedMatch[], myId: string | null): Analytics {
  const types: ScoreTypes = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, holes: 0 };
  const par = { 3: [0, 0], 4: [0, 0], 5: [0, 0] } as Record<3 | 4 | 5, [number, number]>;
  const diff = [
    { label: 'Hardest holes (Hcp 1–6)', lo: 1, hi: 6, sum: 0, n: 0 },
    { label: 'Middle holes (Hcp 7–12)', lo: 7, hi: 12, sum: 0, n: 0 },
    { label: 'Easiest holes (Hcp 13–18)', lo: 13, hi: 18, sum: 0, n: 0 },
  ];
  const nine = { front: [0, 0], back: [0, 0] };
  const trend: TrendPoint[] = [];
  let putts = 0, puttHoles = 0, fir = 0, firTries = 0, gir = 0, girTries = 0, statHoles = 0, played = 0;

  for (const r of [...rounds].sort((a, b) => a.createdAt - b.createdAt)) {
    if (r.status !== 'complete') continue;
    const pid = r.players.find((p) => ids.includes(p.id))?.id;
    if (!pid) continue;
    const tee = teeFor(r, pid);
    const scores = tee.holes.map((_, i) => grossAt(r, pid, i + 1));
    if (scores.every((s) => s === null)) continue;
    played++;
    tee.holes.forEach((h, i) => {
      const g = scores[i];
      if (g === null) return;
      const d = g - h.par;
      types.holes++;
      if (d <= -2) types.eagle++;
      else if (d === -1) types.birdie++;
      else if (d === 0) types.par++;
      else if (d === 1) types.bogey++;
      else types.double++;
      const pk = (h.par >= 5 ? 5 : h.par <= 3 ? 3 : 4) as 3 | 4 | 5;
      par[pk][0] += d;
      par[pk][1]++;
      const band = diff.find((b) => h.strokeIndex >= b.lo && h.strokeIndex <= b.hi);
      if (band) { band.sum += d; band.n++; }
      const st = r.stats[pid]?.[i];
      if (st) {
        statHoles++;
        if (st.putts != null) { putts += st.putts; puttHoles++; }
        if (h.par >= 4 && st.fairway) { firTries++; if (st.fairway === 'hit') fir++; }
        if (st.putts != null) { girTries++; if (g - st.putts <= h.par - 2) gir++; }
      }
    });
    for (const [key, from] of [['front', 0], ['back', 9]] as const) {
      const part = scores.slice(from, from + 9);
      if (part.length === 9 && part.every((s) => s !== null)) {
        nine[key][0] += part.reduce<number>((s, v, k) => s + (v as number) - tee.holes[from + k].par, 0);
        nine[key][1]++;
      }
    }
    if (scores.length === 18 && scores.every((s) => s !== null)) {
      const gross = (scores as number[]).reduce((a, b) => a + b, 0);
      trend.push({ roundId: r.id, date: r.createdAt, gross, toPar: gross - tee.par, course: shortCourseName(courseFor(r).name) });
    }
  }

  const h2h = myId ? history.filter((m) => m.sideA.includes(myId) || m.sideB.includes(myId)) : [];
  const record = { wins: 0, losses: 0, halves: 0 };
  for (const m of h2h) {
    const mine = m.sideA.includes(myId!) ? 'A' : 'B';
    if (m.result === 'halved') record.halves++;
    else if (m.result === mine) record.wins++;
    else record.losses++;
  }

  return {
    rounds: played,
    holes: types.holes,
    trend: trend.slice(-12),
    types,
    byPar: {
      3: { over: avg(par[3][0], par[3][1]), holes: par[3][1] },
      4: { over: avg(par[4][0], par[4][1]), holes: par[4][1] },
      5: { over: avg(par[5][0], par[5][1]), holes: par[5][1] },
    },
    nines: { front: avg(nine.front[0], nine.front[1]), back: avg(nine.back[0], nine.back[1]) },
    difficulty: diff.map((d) => ({ label: d.label, over: avg(d.sum, d.n), holes: d.n })),
    stats: {
      putts: puttHoles ? Math.round((putts / puttHoles) * 18 * 10) / 10 : null,
      fir: firTries ? Math.round((fir / firTries) * 100) : null,
      gir: girTries ? Math.round((gir / girTries) * 100) : null,
      holesTracked: statHoles,
    },
    record,
  };
}

export const overPar = (n: number | null, digits = 2) => (n === null ? '–' : n === 0 ? 'E' : `${n > 0 ? '+' : ''}${n.toFixed(digits)}`);
