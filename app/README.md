# Mobile app (Expo / React Native)

iPhone-first app built with Expo SDK 58 and Expo Router. All scoring logic comes from `../engine`.

## Screens
- **Home**: rounds in progress and completed
- **New Round**: course & tees → players (saved for next time) → main game, options, side matches, stats on/off
- **Scorecard**: hole-by-hole entry, stroke dots, wolf picks, Nassau presses, live game status
- **Results**: winners, scores, stats, Golf Canada posting reminder
- **Players**: your regular group and their handicap indexes

Everything is saved on the phone and works offline. Accounts, syncing and live leaderboards come next.

## Run it
```bash
npm install          # from the repo root
npm run app          # starts Expo; scan the QR code with your iPhone camera
```
