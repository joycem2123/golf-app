/**
 * AI overview of a whole event (trip, Ryder Cup or season), from every completed match in it (or, for a Points
 * Race, its standings and rounds).
 * Saved on the event (so everyone sees the same one) and rewritten only when more matches finish.
 */
import { teamName } from '@/lib/team-colors';
import type { EventRecord, RoundRecord } from '@/store/store';
import { useStore } from '@/store/store';
import { ensureSession } from '@/sync/auth';
import { needsProError, openPaywall, usePro } from '@/lib/pro';
import { supabase } from '@/sync/supabase';
import { cupScore, eventMatches, eventStandings, eventTeamTotals, formatPoints } from './events';
import { courseFor } from './round';
import { fedexStandings } from '@golf/engine';
import { currentHalf, fedexResults } from './fedex';
import { isMeId } from './me';
import { track } from './usage';

const asking = new Set<string>();

/** Fingerprint of the completed results the story would describe. */
export function eventStoryKey(e: EventRecord, rounds: RoundRecord[]): string {
  // Completing the event makes the story final, so it can be rewritten as the full story.
  const final = e.status === 'complete' ? '|final' : '';
  if (e.fedex) {
    const results = fedexResults(e, rounds);
    return results.length ? `race:${results.map((r) => r.round.id).join(',')}${final}` : '';
  }
  const done = eventMatches(e, rounds).filter((m) => m.result !== null);
  const key = done.map((m) => `${m.id}:${m.result}`).sort().join('|');
  return key ? key + final : '';
}

/** A Points Race season, for the story: how it's scored, the leaders, the standings and the rounds. */
function raceFacts(e: EventRecord, rounds: RoundRecord[]) {
  const cfg = e.fedex!;
  const players = useStore.getState().players;
  const st = useStore.getState();
  const myName = players.find((p) => p.id === st.myPlayerId)?.name;
  const nm = (id: string) => players.find((p) => p.id === id)?.name ?? (isMeId(id) ? myName : undefined) ?? rounds.flatMap((r) => r.players).find((p) => p.id === id)?.name ?? 'a player';
  const results = fedexResults(e, rounds);
  const pts = (n: number) => Math.round(n * 10) / 10;
  const table = (part: 'first' | 'second' | 'season') =>
    fedexStandings(results, cfg, part, e.playerIds).filter((r) => r.played > 0).slice(0, 12)
      .map((r) => ({ position: r.position, player: nm(r.playerId), points: pts(r.points), roundsPlayed: r.played, average: pts(r.average) }));
  const half = currentHalf(e, results);
  const planned = (e.rounds ?? []).filter((x) => !x.roundId).length;
  return {
    event: e.name,
    type: 'season-long Stableford points race',
    howScored: `Every round is Stableford. Each player's race points for a round are their Stableford points plus a finishing bonus for their place that day (1st +${cfg.bonus[0] ?? 0}, 2nd +${cfg.bonus[1] ?? 0}, and so on; ties share). The standings add up each player's best ${cfg.best.first} rounds in the 1st half, best ${cfg.best.second} in the 2nd half, and best ${cfg.best.season} across the season. The 2nd half ${cfg.half.kind === 'date' ? `started ${cfg.half.date}` : `starts after round ${cfg.half.count}`}.`,
    finished: e.status === 'complete',
    currentHalf: e.status === 'complete' ? 'season over' : half === 1 ? '1st half' : '2nd half',
    roundsPlayed: results.length,
    roundsStillScheduled: e.status === 'complete' ? 0 : planned,
    seasonStandings: table('season'),
    firstHalfStandings: table('first'),
    secondHalfStandings: table('second'),
    roundWinners: results.map((r, i) => ({ round: i + 1, date: r.round.date, half: r.half, winners: r.rows.filter((x) => x.place === 1).map((x) => nm(x.playerId)), stableford: r.rows[0]?.stableford, players: r.rows.length })),
    latestRounds: results.slice(-5).map((r, i, a) => ({
      round: results.length - a.length + i + 1,
      date: r.round.date,
      results: r.rows.slice(0, 8).map((x) => ({ place: `${x.tied ? 'T' : ''}${x.place}`, player: nm(x.playerId), stableford: x.stableford, bonus: x.bonus, racePoints: x.cup })),
    })),
  };
}

function eventFacts(e: EventRecord, rounds: RoundRecord[]) {
  if (e.fedex) return raceFacts(e, rounds);
  const players = useStore.getState().players;
  const first = (id: string) => (players.find((p) => p.id === id)?.name ?? rounds.flatMap((r) => r.players).find((p) => p.id === id)?.name ?? '?').split(' ')[0];
  const side = (ids: string[]) => ids.map(first).join(' & ');
  const teamOfPlayer = (id: string) =>
    e.teams ? (e.teams.A.playerIds.includes(id) ? e.teams.A.name : e.teams.B.playerIds.includes(id) ? e.teams.B.name : undefined) : e.teamOf?.[id] ? teamName(e.teamOf[id], e.teamNames) : undefined;
  const evRounds = rounds.filter((r) => r.eventId === e.id).sort((a, b) => a.createdAt - b.createdAt);
  const matches = eventMatches(e, rounds);
  const byRound = evRounds.map((r, i) => {
    let course = '';
    try { course = courseFor(r).name; } catch { /* course missing */ }
    return {
      round: r.label ?? `Round ${i + 1}`,
      date: new Date(r.createdAt).toISOString().slice(0, 10),
      course,
      finished: r.status === 'complete',
      matches: matches
        .filter((m) => m.roundId === r.id && m.result !== null)
        .map((m) => ({
          format: m.name,
          sideA: side(m.sideA),
          sideB: side(m.sideB),
          ...(e.teams ? { sideATeam: e.teams.A.name, sideBTeam: e.teams.B.name } : {}),
          result: m.result === 'halved' ? 'halved' : `${m.result === 'A' ? side(m.sideA) : side(m.sideB)} won`,
          detail: m.summary,
        })),
    };
  }).filter((r) => r.matches.length > 0);

  let score: unknown = null;
  if (e.teams) {
    const s = cupScore(e, rounds).standings;
    score = {
      [e.teams.A.name]: formatPoints(s.teamA),
      [e.teams.B.name]: formatPoints(s.teamB),
      pointsToWin: formatPoints(s.toWin),
      winner: s.winner === 'A' ? e.teams.A.name : s.winner === 'B' ? e.teams.B.name : s.winner === 'tied' ? 'tied' : null,
    };
  } else if (e.teamOf && (e.teamLetters?.length ?? 0) >= 2) {
    score = Object.fromEntries(eventTeamTotals(e, rounds).totals.map((t) => [teamName(t.letter, e.teamNames), formatPoints(t.points)]));
  }
  const standings = eventStandings(e, rounds).map((row) => ({
    player: first(row.playerId),
    team: teamOfPlayer(row.playerId),
    record: `${row.wins}-${row.losses}-${row.halves}`,
    points: formatPoints(row.points),
  }));
  const plannedRounds = e.rounds?.length ?? evRounds.length;
  return {
    event: e.name,
    type: e.type === 'cup' ? 'Ryder Cup style team event' : e.type === 'season' ? 'season' : 'golf trip',
    roundsPlayed: evRounds.filter((r) => r.status === 'complete').length,
    roundsPlanned: plannedRounds,
    finished: e.status === 'complete' || (plannedRounds > 0 && evRounds.filter((r) => r.status === 'complete').length >= plannedRounds),
    score,
    standings,
    rounds: byRound,
  };
}

/** Ask for a fresh overview if the completed results changed since the last one. Returns the new text, or null. */
export async function refreshEventStory(e: EventRecord, rounds: RoundRecord[]): Promise<string | null> {
  const key = eventStoryKey(e, rounds);
  if (!key || e.story?.key === key || asking.has(`${e.id}:${key}`)) return null;
  if (e.remote?.role === 'viewer') return null; // the organiser's phone writes it; viewers get it synced
  // Generating needs my own Pro (in a host's event too); everyone sees a story once it's written.
  if (!usePro.getState().pro) { openPaywall('story'); return null; }
  asking.add(`${e.id}:${key}`);
  try {
    await ensureSession();
    const { data, error } = await supabase.functions.invoke('event-story', { body: { facts: eventFacts(e, rounds), eventId: e.id } });
    if (error && needsProError(error, data)) { openPaywall('story'); return null; }
    if (error || !data?.story) return null;
    useStore.getState().setEventStory(e.id, { text: data.story as string, key });
    track('event_story_generated', { type: e.type });
    return data.story as string;
  } catch {
    return null;
  } finally {
    asking.delete(`${e.id}:${key}`);
  }
}
