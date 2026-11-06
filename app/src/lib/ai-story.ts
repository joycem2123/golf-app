import type { GameResult } from '@golf/engine';

import { useStore, type RoundRecord } from '@/store/store';
import { supabase } from '@/sync/supabase';
import { shareRound } from '@/sync/sync';
import type { MatchOutcome } from './results';
import { courseFor } from './round';
import type { StoryHole } from './story';

const asked = new Set<string>();

/**
 * Ask the server (Claude) for a written story of a finished match, once per match.
 * The story is saved on the round, so everyone in it sees the same one.
 * Returns null when it isn't available (offline, or AI summaries not set up).
 */
export async function requestAiStory(r: RoundRecord, res: GameResult, m: MatchOutcome, holes: StoryHole[]): Promise<string | null> {
  const gameId = r.games[m.gi].id ?? String(m.gi);
  const tag = `${r.id}:${gameId}`;
  if (r.stories?.[gameId]) return r.stories[gameId];
  if (asked.has(tag)) return null;
  asked.add(tag);
  try {
    if (!r.remote) await shareRound(r.id);
    let course = '';
    try { course = courseFor(r).name; } catch { /* course missing */ }
    const label = (h: StoryHole) => (h.outcome === null ? null : h.outcome === 1 ? 'A' : h.outcome === -1 ? 'B' : 'halved');
    const status = (lead: number | null) => (lead === null ? null : lead === 0 ? 'All square' : `${lead > 0 ? 'A' : 'B'} ${Math.abs(lead)} up`);
    const facts = {
      course,
      format: res.title,
      result: m.winner === 'halved' ? 'Halved' : m.winner ? `${m.winner === 'a' ? 'A' : 'B'} won ${m.detail}` : `In progress: ${m.detail}`,
      sideA: m.a.names,
      sideB: m.b.names,
      scoring: r.games[m.gi].handicap?.net === false ? 'gross' : 'net (handicap strokes applied)',
      holes: holes.filter((h) => h.outcome !== null).map((h) => ({ hole: h.hole, par: h.par, A: h.a, B: h.b, won: label(h), after: status(h.lead), birdies: h.birdies.length ? h.birdies : undefined })),
    };
    const { data, error } = await supabase.functions.invoke('match-story', { body: { roundId: r.id, facts } });
    if (error || !data?.story) return null;
    useStore.getState().setStory(r.id, gameId, data.story as string);
    return data.story as string;
  } catch {
    return null;
  }
}
