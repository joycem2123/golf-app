import type { GameKind } from './games';

export interface GameRules {
  /** One paragraph: what the game is. */
  overview: string;
  /** How a hole is played and won. */
  howItWorks: string[];
  /** How the winner is decided. */
  scoring: string[];
  /** How handicaps are applied by default in RIVL. */
  handicaps: string;
  /** Settings you can change when setting up the game. */
  options?: string[];
  /** A short worked example. */
  example?: string;
}

/** Rules and scoring for each format, as RIVL scores them. */
export const GAME_RULES: Record<GameKind, GameRules> = {
  singles: {
    overview: 'One player against another, decided hole by hole rather than by total strokes.',
    howItWorks: [
      'Each hole is won by the player with the lower net score, or halved if the scores are equal.',
      'The match is “1 UP”, “2 UP” and so on for whoever has won more holes; “All Square” when level.',
    ],
    scoring: [
      'The match ends when one player is up by more holes than are left (e.g. 3 UP with 2 to play is a “3&2” win).',
      'Level after 18 holes is a halved match.',
      '“Dormie” means a player is up by exactly the number of holes left.',
    ],
    handicaps: 'Full course handicap (100%), with strokes off the low player: the better player plays off 0 and the other gets the difference, on the hardest holes first.',
    options: ['Net or gross', 'Strokes off the low man or full handicaps', 'Handicap allowance %'],
    example: 'Mike gets 6 strokes from Dave. On a hole where Mike gets a stroke, Mike’s 5 is a net 4 and halves Dave’s 4.',
  },
  bestBall: {
    overview: 'Two teams of two in a match play contest (also called four-ball). Everyone plays their own ball; each team counts its best score on each hole.',
    howItWorks: [
      'All four players play every hole.',
      'Each team’s score on a hole is the lower net score of its two players.',
      'The team with the lower score wins the hole; equal scores halve it.',
    ],
    scoring: ['Scored like singles match play: holes up, closed out as “4&3”, or halved after 18.'],
    handicaps: '90% of course handicap (the WHS recommendation for four-ball match play), with strokes off the lowest of the four players.',
    options: ['Teams', 'Net or gross', 'Strokes off the low man or full handicaps', 'Allowance %', 'Singles side matches'],
    example: 'Team A: Mike 5 (net 4), Dave 4. Team B: Sam 5, Joe 5. Team A’s best ball is 4, Team B’s is 5: Team A wins the hole.',
  },
  alternateShot: {
    overview: 'Two teams of two, each team playing one ball (also called foursomes). Partners take turns hitting the same ball.',
    howItWorks: [
      'Partners alternate tee shots: one tees off on the odd holes, the other on the even holes.',
      'After the tee shot, partners alternate shots until the ball is holed.',
      'The team with the lower net score wins the hole.',
    ],
    scoring: ['Scored like match play: holes up, closed out early, or halved after 18. One score is entered per team.'],
    handicaps: 'Each team gets 50% of the partners’ combined course handicaps (WHS recommendation), with strokes off the lower team.',
    options: ['Teams', 'Net or gross', 'Allowance %'],
  },
  nassau: {
    overview: 'Three bets in one match: the front 9, the back 9 and the full 18. Played 1 v 1 or as a 2 v 2 best ball.',
    howItWorks: [
      'Each hole is won or halved as in match play (best ball for teams).',
      'The front 9, back 9 and overall 18 are separate matches, each worth 1 point.',
      'A side that’s behind can “press”: a new 1-point bet from that hole to the end of the nine (or the 18).',
    ],
    scoring: [
      'Win a bet = 1 point. A halved bet is split ½ point each.',
      'With carryovers on, a halved front or back carries its point to the next bet instead of being split.',
      'Most points after all bets and presses wins.',
    ],
    handicaps: 'Full course handicap for 1 v 1; teams use the best ball rules. Strokes off the low player.',
    options: ['Carryovers', 'Net or gross', 'Strokes off the low man or full handicaps', 'Allowance %', 'Presses are added during the round'],
    example: 'Team A wins the front, the back is halved, Team A wins the 18: Team A 2½, Team B ½.',
  },
  skins: {
    overview: 'Every hole is worth a “skin”. Win the hole outright (no ties) to win the skin.',
    howItWorks: [
      'The lowest net score on a hole wins the skin, but only if no one ties it.',
      'If two or more players tie for low, nobody wins that hole.',
    ],
    scoring: [
      'Carryovers on: a tied hole’s skin rides to the next hole, so the next winner can collect several.',
      'Carryovers off: tied holes are simply lost.',
      'Validation (optional): after winning a skin, the winner must also tie or beat the field (or make par) on the next hole, or the skin carries over.',
      'Most skins wins.',
    ],
    handicaps: 'Full course handicap (100%), strokes off the low player. Choose gross for scratch skins.',
    options: ['Carryovers', 'Validation: none, tie or beat next hole, or par next hole', 'Net or gross', 'Allowance %'],
  },
  wolf: {
    overview: 'A rotating “wolf” chooses, hole by hole, whether to team up with a partner or take on everyone alone. For 3 or 4 players.',
    howItWorks: [
      'The wolf rotates through the group in tee order.',
      'The wolf watches the tee shots and can pick a partner right after that player hits.',
      'Lone wolf: the wolf decides to play alone after seeing the tee shots.',
      'Blind wolf: the wolf goes alone before anyone tees off, for bigger points.',
      'Each side’s best net score counts on the hole.',
    ],
    scoring: [
      'Wolf + partner win: 2 points each. Opponents beat them: 3 points each.',
      'Lone wolf wins: 4 points. Lone wolf loses: 1 point to each opponent.',
      'Blind wolf wins: 6 points. Blind wolf loses: 2 points to each opponent.',
      'With 4 players, the player in last place is the wolf on 17 and 18 (or keep rotating).',
      'Most points wins. Point values can be changed.',
    ],
    handicaps: 'Full course handicap (100%), strokes off the low player.',
    options: ['Point values', 'Ties: no points or carry over', 'Holes 17 & 18: last place is wolf or keep rotating', 'Net or gross'],
  },
  vegas: {
    overview: 'Two teams of two. On each hole, each team’s two scores are put together into a two-digit number, and the lower number wins the difference.',
    howItWorks: [
      'Each team combines its scores low number first: a 4 and a 5 make 45.',
      'The team with the lower number wins the difference in points: 45 vs 47 is 2 points.',
    ],
    scoring: [
      'Birdie flip: if a team makes a birdie (and the other doesn’t), the other team’s number is flipped high digit first (45 becomes 54).',
      'Scores of 10+: by default the big number goes first (a 4 and a 10 make 104).',
      'Points are added up over the round; the team ahead at the end wins.',
    ],
    handicaps: 'Full course handicap (100%), strokes off the low player.',
    options: ['Birdie flips', 'Scores of 10+: big number first or low first', 'Net or gross'],
    example: 'Team A makes 3 and 5 (birdie) = 35. Team B makes 4 and 5 = 45, flipped to 54. Team A wins 19 points.',
  },
  stableford: {
    overview: 'Points for your score on each hole compared with par. Highest total wins, and one bad hole can’t ruin your round.',
    howItWorks: ['Play every hole as normal. Your net score on each hole earns points.'],
    scoring: [
      'Standard: double bogey or worse 0, bogey 1, par 2, birdie 3, eagle 4, albatross 5.',
      'Modified (more reward for birdies): double+ −3, bogey −1, par 0, birdie +2, eagle +5, albatross +8.',
      'Most points wins.',
    ],
    handicaps: '95% of course handicap (WHS recommendation for individual Stableford), strokes off the low player.',
    options: ['Standard or modified points', 'Net or gross', 'Allowance %'],
  },
  scramble: {
    overview: 'Teams play the best shot every time. Fast, social and great for mixed abilities.',
    howItWorks: [
      'Everyone on the team tees off; the team picks the best drive.',
      'Everyone plays their next shot from that spot, and so on until the ball is holed.',
      'One score is entered per team on each hole.',
    ],
    scoring: ['Lowest net team total wins. Scramble rounds can’t be posted for handicap.'],
    handicaps: 'Team handicap from each player’s course handicap: 4 players 25% / 20% / 15% / 10% (lowest to highest), 2 players 35% / 15%.',
    options: ['Teams', 'Net or gross'],
  },
  shamble: {
    overview: 'A mix of scramble and best ball: the team picks the best drive, then everyone plays their own ball into the hole.',
    howItWorks: [
      'Everyone tees off and the team picks the best drive.',
      'From there, each player plays their own ball and holes out.',
      'The team counts its best score (or best 2) on each hole.',
    ],
    scoring: ['Lowest net team total wins. Shamble rounds can’t be posted for handicap.'],
    handicaps: '85% of course handicap for each player, strokes off the low player.',
    options: ['Teams', 'Scores that count per hole (1 or 2)', 'Net or gross', 'Allowance %'],
  },
  strokePlay: {
    overview: 'Classic golf: count every stroke over 18 holes. Lowest total wins.',
    howItWorks: ['Play every hole to the finish and record your score.'],
    scoring: ['Lowest net total wins (or gross, if you choose). Shown as a score to par.'],
    handicaps: '95% of course handicap (WHS recommendation for individual stroke play).',
    options: ['Net or gross', 'Allowance %'],
  },
};
