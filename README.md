# Golf App (working name)

A golf app for competitive matches with friends: handicaps, many game formats, live
leaderboards, and events (boys' trips, Ryder Cup-style cups, season-long leagues).

## What's built so far

### `engine/`: the scoring engine
The rules of golf and of every game, written as plain logic with automated tests. The phone
app will use this to work out every score, so it's tested on its own first.

| Area | What it does |
|---|---|
| Handicaps | WHS Course Handicap and Playing Handicap; strokes on each hole by stroke index (including plus handicaps); strokes off the low man (default) or full handicaps |
| Singles match play | Net or gross; "3&2", "2 UP thru 14", dormie |
| Best ball (four-ball) | 2 v 2, best net ball, 90% allowance |
| Alternate shot | One ball per team, 50% of combined course handicaps |
| Side matches | Singles matches running alongside any main game |
| Nassau | Front, back and overall; manual presses; optional carryovers |
| Skins | Net or gross, carryovers on/off, validation (none / tie-or-better / par-or-better) |
| Wolf | 3 or 4 players; partner, lone and blind wolf; configurable points; tie carryover; last-place player is wolf on 17-18 (or keep rotating) |
| Vegas | Team numbers, birdie flip, 10+ rule |
| Stableford | Standard, modified, or custom points; individual or team best-N |
| Scramble / shamble | Team handicaps, net to par |
| Stroke play | Individual gross/net |
| Events | Handicaps locked at event start; Ryder Cup points (win 1, halve ½), holder retains on tie, live projection; randomized pairings; season standings; head-to-head records |
| Score syncing | Latest entry wins; the group is notified when someone's score is changed by another scorekeeper |
| Posting reminders | Only for formats where each player hits every shot (not scramble, shamble or alternate shot) |
| Stats (optional) | Putts, fairways, greens in regulation, penalties, scoring breakdown |

### Default handicap allowances (all can be changed per game)
| Format | Default |
|---|---|
| Singles match play | 100% |
| Best ball match play | 90% |
| Alternate shot | 50% of combined |
| Stroke play / Stableford | 95% |
| Skins, Wolf, Vegas | 100% |
| Shamble | 85% |
| Scramble (4 players) | 25% / 20% / 15% / 10% |
| Scramble (2 players) | 35% / 15% |

## Running the tests
```bash
npm install
npm test
```

## Roadmap
1. ~~Scoring engine~~ ✅
2. iPhone app (Expo / React Native): course picker, game setup, hole-by-hole scoring, results. Works offline.
3. Accounts (email / Apple / Google), cloud sync (Supabase), live leaderboards with guest codes
4. Events: trips, cups, seasons, head-to-head, notifications
5. Course database for Canada and the US, TestFlight beta, App Store
