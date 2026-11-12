/**
 * Where the teams stand: in an event, the event's points so far and what they'll be if the matches in
 * play finish as they stand; outside an event, the same for the round. Used by live scoring's team bar
 * and the Lock Screen card, so the two always agree.
 */
import { cupScore, eventTeamTotals } from '@/lib/events';
import { liveTeamScore } from '@/lib/results';
import type { evaluate } from '@/lib/round';
import { namesFor, teamName } from '@/lib/team-colors';
import type { EventRecord, RoundRecord } from '@/store/store';
import { teamColor } from '@/theme';

export interface TeamStanding {
  /** The round's team letter (for colours and players). */
  letter: string;
  name: string;
  color: string;
  /** Points now and projected (the event's, or the round's outside an event). */
  points: number;
  projected: number;
  /** This round only. */
  roundPoints: number;
  roundProjected: number;
  leading: number;
  members: string[];
}

export interface TeamStatus {
  scope: 'event' | 'round';
  teams: [TeamStanding, TeamStanding];
  /** Matches in play, and how many are level. */
  live: number;
  square: number;
  /** Cup events: points needed to win, if not yet won. */
  toWin?: number;
}

/** `rounds` should include the event's other rounds (from the phone or the server). */
export function teamStatus(r: RoundRecord, results: ReturnType<typeof evaluate>, event: EventRecord | undefined, rounds: RoundRecord[]): TeamStatus | null {
  const live = liveTeamScore(r, results);
  if (!live || live.teams.length < 2) return null;
  const [A, B] = live.teams;
  const names = namesFor(r, event);
  const picks = r.teamColors ?? event?.teamColors;
  const base = (t: typeof A) => ({
    letter: t.letter,
    name: teamName(t.letter, names),
    color: teamColor(t.letter, picks).color,
    points: t.points,
    projected: t.projected,
    roundPoints: t.points,
    roundProjected: t.projected,
    leading: t.leading,
    members: t.members,
  });
  const a = base(A);
  const b = base(B);
  let scope: TeamStatus['scope'] = 'round';
  let toWin: number | undefined;

  if (event) {
    const evRounds = [...rounds.filter((x) => x.eventId === event.id && x.id !== r.id), r];
    if (event.teams) {
      // Ryder Cup style: Team A / Team B, with the engine's own projection.
      const s = cupScore(event, evRounds).standings;
      a.name = event.teams.A.name;
      b.name = event.teams.B.name;
      a.points = s.teamA;
      b.points = s.teamB;
      a.projected = s.projected?.teamA ?? s.teamA + (A.projected - A.points);
      b.projected = s.projected?.teamB ?? s.teamB + (B.projected - B.points);
      toWin = s.winner ? undefined : s.toWin;
      scope = 'event';
    } else if (event.teamOf && (event.teamLetters?.length ?? 0) >= 2) {
      // Team seasons and trips: points across every round, plus what this round's live matches add.
      const { totals } = eventTeamTotals(event, evRounds);
      const of = (L: string) => totals.find((t) => t.letter === L)?.points ?? 0;
      a.points = of(A.letter);
      b.points = of(B.letter);
      a.projected = a.points + (A.projected - A.points);
      b.projected = b.points + (B.projected - B.points);
      scope = 'event';
    }
  }
  return { scope, teams: [a, b], live: live.live, square: live.square, toWin };
}
