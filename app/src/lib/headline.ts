import { half, type GameResult, type MatchStatus, type Player } from '@golf/engine';

import { toPar } from './format';
import { teamIdName } from './games';

export interface Headline {
  /** Who is ahead, e.g. "Mike & Dave". Empty when all square. */
  leader: string;
  /** Leader's side: 0 = team A / first side, 1 = team B / second side. */
  side: 0 | 1 | null;
  /** The big status, e.g. "2 UP", "All Square", "Win 3&2", "14 pts". */
  big: string;
  /** e.g. "thru 7", "Final". */
  small: string;
  /** Compact extra lines (Nassau bets etc). */
  extra: string[];
  /** Stroke play: the top of the leaderboard (shown instead of leader / big). */
  board?: { id: string; pos: string; name: string; value: string }[];
}

const playerName = (id: string, players: Player[]) =>
  teamIdName(id) ?? players.find((p) => p.id === id)?.name ?? id;

function matchLine(s: MatchStatus, nameA: string, nameB: string) {
  if (s.thru === 0) return { leader: '', side: null, big: 'All Square', small: 'Not started' } as const;
  const side = s.lead > 0 ? 0 : s.lead < 0 ? 1 : null;
  const leader = side === 0 ? nameA : side === 1 ? nameB : '';
  if (s.finished) {
    return {
      leader: s.winner === 'halved' ? '' : leader,
      side: s.winner === 'halved' ? null : side,
      big: s.winner === 'halved' ? 'Halved' : s.closedOutOnHole ? `Win ${s.display}` : `Win ${s.display}`,
      small: 'Final',
    } as const;
  }
  return {
    leader,
    side,
    big: s.lead === 0 ? 'All Square' : `${Math.abs(s.lead)} UP${s.dormie ? ' · Dormie' : ''}`,
    small: `thru ${s.thru}`,
  } as const;
}

function segStatus(s: MatchStatus) {
  if (s.thru === 0) return '–';
  if (s.lead === 0) return s.finished ? 'Halved' : 'AS';
  return `${s.lead > 0 ? 'A' : 'B'} ${s.finished ? s.display : `${Math.abs(s.lead)} UP`}`;
}

export function headline(result: GameResult, players: Player[]): Headline {
  const small = result.finished ? 'Final' : result.thru ? `thru ${result.thru}` : 'Not started';
  switch (result.type) {
    case 'matchPlay':
      return { ...matchLine(result.status, result.sideA.name, result.sideB.name), extra: [] };
    case 'nassau': {
      const [front, back, overall] = result.segments;
      const { A, B } = result.points;
      const pts: 0 | 1 | null = A === B ? null : A > B ? 0 : 1;
      const final = result.finished
        ? {
            leader: pts === null ? '' : result.standings[pts].name,
            side: pts,
            big: pts === null ? `Tied ${half(A)}–${half(B)}` : `Win ${half(Math.max(A, B))}–${half(Math.min(A, B))}`,
            small: 'Final',
          }
        : matchLine(overall.status, result.standings[0].name, result.standings[1].name);
      return {
        ...final,
        extra: [
          `Front ${segStatus(front.status)}  ·  Back ${segStatus(back.status)}  ·  18 ${segStatus(overall.status)}`,
          `Points  A ${half(A)} – ${half(B)} B${result.presses.length ? `  ·  ${result.presses.length} press${result.presses.length > 1 ? 'es' : ''}` : ''}`,
        ],
      };
    }
    case 'vegas': {
      const side = result.totalA > 0 ? 0 : result.totalA < 0 ? 1 : null;
      return {
        leader: side === null ? '' : result.standings.find((s) => s.position === 1 && s.value > 0)?.name ?? '',
        side,
        big: side === null ? 'All Square' : `${result.finished ? 'Win by ' : '+'}${Math.abs(result.totalA)} pts`,
        small,
        extra: [],
      };
    }
    case 'scramble':
    case 'shamble':
      // Two teams: a match, hole by hole (with each team's score to par underneath).
      if (result.match && result.matchSides) {
        const [a, b] = result.matchSides;
        const toParOf = (id: string) => toPar(result.totals[id]?.toPar ?? 0);
        return {
          ...matchLine(result.match, playerName(a.id, players), playerName(b.id, players)),
          extra: result.match.thru ? [`${playerName(a.id, players)} ${toParOf(a.id)}  ·  ${playerName(b.id, players)} ${toParOf(b.id)}`] : [],
        };
      }
    // falls through
    case 'strokePlay': {
      // A small leaderboard: the top 3 (ties shown as T2), not a big "Tied".
      const started = result.thru > 0 || result.standings.some((s) => s.thru > 0);
      const tied = (pos: number) => result.standings.filter((s) => s.position === pos).length > 1;
      const board = result.standings.slice(0, 3).map((s) => ({
        id: s.id,
        pos: started ? `${tied(s.position) ? 'T' : ''}${s.position}` : '–',
        name: playerName(s.id, players),
        value: started ? toPar(s.value) : '–',
      }));
      const lead = result.standings.filter((s) => s.position === 1);
      return {
        leader: '',
        side: lead.length > 1 ? null : teamIdName(lead[0].id) === 'Team A' ? 0 : teamIdName(lead[0].id) === 'Team B' ? 1 : null,
        big: '',
        small,
        extra: result.standings.length > 3 ? [`+${result.standings.length - 3} more`] : [],
        board,
      };
    }
    default: {
      // Skins, wolf, stableford: points tables
      const unit = result.type === 'skins' ? 'skin' : 'pt';
      const lead = result.standings.filter((s) => s.position === 1);
      const fmt = (v: number) => `${v} ${unit}${Math.abs(v) === 1 ? '' : 's'}`;
      const carry = result.type === 'skins' && !result.finished && result.holes.at(-1)?.status === 'carried' ? result.holes.at(-1)!.value : 0;
      return {
        leader: lead[0].value === 0 && result.type !== 'stableford' ? '' : lead.map((l) => playerName(l.id, players)).join(' & '),
        side: null,
        big: lead[0].value === 0 && result.type !== 'stableford' ? (result.thru ? 'No leader yet' : 'Not started') : fmt(lead[0].value),
        small: carry ? `${small} · ${carry} riding` : small,
        extra: result.standings.filter((s) => s.position !== 1 || lead.length > 1).slice(lead.length > 1 ? lead.length : 0).map((s) => `${s.position}. ${playerName(s.id, players)}  ${fmt(s.value)}`),
      };
    }
  }
}
