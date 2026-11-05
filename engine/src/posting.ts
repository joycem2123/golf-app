import type { GameConfig } from './games';
import type { PlayerId } from './types';

/**
 * A round can be posted for handicap only if the player played their own ball
 * on every shot. Alternate shot, scramble and shamble don't qualify.
 */
export function postingEligible(game: GameConfig): boolean {
  switch (game.type) {
    case 'matchPlay': return game.format !== 'foursomes';
    case 'scramble':
    case 'shamble': return false;
    default: return true;
  }
}

function playersIn(game: GameConfig): PlayerId[] {
  switch (game.type) {
    case 'matchPlay':
    case 'nassau': return [...game.sideA.members, ...game.sideB.members];
    case 'skins':
    case 'strokePlay': return game.playerIds;
    case 'wolf': return game.order;
    case 'vegas': return [...game.teamA.members, ...game.teamB.members];
    case 'stableford': return game.teams ? game.teams.flatMap((t) => t.members) : (game.playerIds ?? []);
    case 'scramble':
    case 'shamble': return game.teams.flatMap((t) => t.members);
  }
}

/** Players who should get a "post your score to Golf Canada" reminder after the round. */
export function postingReminders(games: GameConfig[]): PlayerId[] {
  const out = new Set<PlayerId>();
  for (const g of games) if (postingEligible(g)) playersIn(g).forEach((p) => out.add(p));
  return [...out];
}
