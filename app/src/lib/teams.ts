import type { GameConfig, GameResult } from '@golf/engine';

import type { RoundRecord } from '@/store/store';
import type { Colors } from '@/theme';
import { grossAt } from './round';

export interface TeamGroup {
  id: string;
  label: string;
  names: string;
  color: string;
  soft: string;
  /** Scorecard keys shown inside this team's box. */
  keys: string[];
}

/** Teams in the main game (null for individual games). */
export function teamGroups(r: RoundRecord, c: Colors): TeamGroup[] | null {
  const g = r.games[0];
  const name = (id: string) => r.players.find((p) => p.id === id)?.name ?? id;
  const make = (id: string, i: number, members: string[], keys: string[]): TeamGroup => ({
    id,
    label: i === 0 ? 'Team A' : 'Team B',
    names: members.map(name).join(' & '),
    color: i === 0 ? c.teamA : c.teamB,
    soft: i === 0 ? c.teamASoft : c.teamBSoft,
    keys,
  });
  if ((g.type === 'matchPlay' && g.format === 'fourBall') || (g.type === 'nassau' && g.format === 'fourBall')) {
    return [g.sideA, g.sideB].map((s, i) => make(s.id, i, s.members, s.members));
  }
  if (g.type === 'matchPlay' && g.format === 'foursomes') return [g.sideA, g.sideB].map((s, i) => make(s.id, i, s.members, [s.id]));
  if (g.type === 'vegas') return [g.teamA, g.teamB].map((t, i) => make(t.id, i, t.members, t.members));
  if (g.type === 'scramble') return g.teams.map((t, i) => make(t.id, i, t.members, [t.id]));
  if (g.type === 'shamble') return g.teams.map((t, i) => make(t.id, i, t.members, t.members));
  return null;
}

export interface TeamHole {
  /** The score that counts for the team on this hole (null until everyone has a score). */
  score: number | null;
  label: string;
  /** Rows whose ball is the one being used. */
  counting: string[];
}

const usesNet = (g: GameConfig) => g.handicap?.net !== false;

/** The team's counting score on a hole, with which ball(s) count. */
export function teamHole(r: RoundRecord, result: GameResult | undefined, team: TeamGroup, hole: number): TeamHole {
  const g = r.games[0];
  const strokes = result?.strokes ?? {};
  const net = usesNet(g);
  const score = (k: string) => {
    const gross = grossAt(r, k, hole);
    return gross === null ? null : net ? gross - (strokes[k]?.[hole - 1] ?? 0) : gross;
  };
  const scores = team.keys.map(score);
  const empty = { score: null, label: '', counting: [] };
  if (scores.some((s) => s === null)) return empty;
  const vals = scores as number[];

  if (g.type === 'vegas' && result?.type === 'vegas') {
    const h = result.holes[hole - 1];
    if (!h) return empty;
    const isA = team.id === g.teamA.id;
    const flipped = h.flipped === (isA ? 'A' : 'B');
    return { score: isA ? h.numberA : h.numberB, label: flipped ? 'Flipped' : 'Team number', counting: team.keys };
  }
  if (g.type === 'shamble') {
    const n = Math.min(g.countBest ?? 1, vals.length);
    const sorted = [...vals].sort((a, b) => a - b).slice(0, n);
    const cutoff = sorted[sorted.length - 1];
    return { score: sorted.reduce((s, v) => s + v, 0), label: net ? `Best ${n} net` : `Best ${n}`, counting: team.keys.filter((_, i) => vals[i] <= cutoff) };
  }
  const best = Math.min(...vals);
  const single = team.keys.length === 1;
  return {
    score: best,
    label: single ? (net ? 'Team net' : 'Team score') : net ? 'Best net ball' : 'Best ball',
    counting: single ? [] : team.keys.filter((_, i) => vals[i] === best),
  };
}

/** Which team won the hole: 0, 1, 'halved', or null if not complete. */
export function holeWinner(holes: TeamHole[]): 0 | 1 | 'halved' | null {
  if (holes.length !== 2 || holes.some((h) => h.score === null)) return null;
  const [a, b] = holes.map((h) => h.score!);
  return a < b ? 0 : b < a ? 1 : 'halved';
}
