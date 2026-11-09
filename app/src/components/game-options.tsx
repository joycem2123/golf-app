import type { Player, WolfPoints } from '@golf/engine';
import { Text, View } from 'react-native';

import { gameInfo, type GameDraft, type TeamOf } from '@/lib/games';
import { MatchupsEditor } from './matchups';
import { radius, space, useColors } from '@/theme';
import { useTeamColor } from '@/lib/team-colors';
import { Body, Card, Chip, H2, Label, OptionRow, Segmented, Stepper, Toggle, styles } from './ui';

const WOLF_POINT_LABELS: [keyof WolfPoints, string][] = [
  ['wolfTeamWin', 'Wolf + partner win (each)'],
  ['opponentsWin', 'Opponents beat wolf + partner (each)'],
  ['loneWolfWin', 'Lone wolf wins'],
  ['loneWolfLoss', 'Lone wolf loses (each opponent)'],
  ['blindWolfWin', 'Blind wolf wins'],
  ['blindWolfLoss', 'Blind wolf loses (each opponent)'],
];

export function GameOptions({
  draft,
  players,
  onChange,
  teamOf,
  hideMatchups,
}: {
  draft: GameDraft;
  players: Player[];
  onChange: (d: GameDraft) => void;
  teamOf?: TeamOf;
  /** Matchups decided later (an event round that's still TBD). */
  hideMatchups?: boolean;
}) {
  const teamColor = useTeamColor();
  const c = useColors();
  const info = gameInfo(draft.kind);
  const set = <K extends keyof GameDraft>(k: K, v: GameDraft[K]) => onChange({ ...draft, [k]: v });
  const showTeams = info.teams && !info.teamSizes;

  return (
    <>
      {info.teamSizes && !hideMatchups && <MatchupsEditor draft={draft} players={players} onChange={onChange} teamOf={teamOf} />}
      {showTeams && (
        <Card>
          <H2>Teams</H2>
          <Label style={{ textTransform: 'none' }}>Set in the Teams step. Go back to change them.</Label>
          {[...new Set(players.map((p) => draft.teamOf[p.id]).filter(Boolean))].sort().map((team) => {
            const tc = teamColor(team);
            return (
              <View key={team} style={{ backgroundColor: tc.soft, borderRadius: radius.md, padding: space.md, borderLeftWidth: 4, borderLeftColor: tc.color, gap: 2 }}>
                <Text style={{ color: tc.color, fontWeight: '800', fontSize: 12, letterSpacing: 1.2 }}>TEAM {team}</Text>
                <Body>{players.filter((p) => draft.teamOf[p.id] === team).map((p) => p.name).join(', ')}</Body>
              </View>
            );
          })}
        </Card>
      )}

      <Card>
        <H2>Handicaps</H2>
        <Segmented options={[{ value: 'net', label: 'Net' }, { value: 'gross', label: 'Gross' }]} value={draft.net ? 'net' : 'gross'} onChange={(v) => set('net', v === 'net')} />
        {draft.net && (
          <>
            <OptionRow label="Strokes">
              <Segmented options={[{ value: 'offLow', label: 'Off the low man' }, { value: 'full', label: 'Full handicaps' }]} value={draft.mode} onChange={(v) => set('mode', v)} />
            </OptionRow>
            {info.defaultAllowance !== null ? (
              <OptionRow label={`Allowance (default ${Math.round(info.defaultAllowance * 100)}%)`}>
                <Stepper value={draft.allowancePct} min={0} max={100} step={5} format={(v) => `${v}%`} onChange={(v) => set('allowancePct', v)} />
              </OptionRow>
            ) : (
              <Label style={{ textTransform: 'none' }}>Team handicap: 25/20/15/10% (4 players) or 35/15% (2 players) of course handicaps</Label>
            )}
          </>
        )}
      </Card>

      {draft.kind === 'nassau' && (
        <Card>
          <H2>Nassau</H2>
          <Toggle label="Carryovers" hint="A halved nine carries its point to the next bet" value={draft.carryovers} onChange={(v) => set('carryovers', v)} />
          <Label style={{ textTransform: 'none' }}>Presses are added during the round from the scorecard.</Label>
        </Card>
      )}

      {draft.kind === 'skins' && (
        <Card>
          <H2>Skins</H2>
          <Toggle label="Carryovers" hint="Tied holes carry the skin to the next hole" value={draft.carryovers} onChange={(v) => set('carryovers', v)} />
          <OptionRow label="Validation">
            <Segmented
              options={[{ value: 'none', label: 'None' }, { value: 'tieOrBetter', label: 'Tie or beat next' }, { value: 'parOrBetter', label: 'Par next hole' }]}
              value={draft.validation}
              onChange={(v) => set('validation', v)}
            />
          </OptionRow>
        </Card>
      )}

      {draft.kind === 'wolf' && (
        <Card>
          <H2>Wolf</H2>
          <Label style={{ textTransform: 'none' }}>Wolf order follows the player order: {players.map((p) => p.name).join(' → ')}</Label>
          <OptionRow label="Tied holes">
            <Segmented options={[{ value: 'noPoints', label: 'No points' }, { value: 'carryover', label: 'Carry over' }]} value={draft.wolfTies} onChange={(v) => set('wolfTies', v)} />
          </OptionRow>
          {players.length === 4 && (
            <OptionRow label="Holes 17 & 18">
              <Segmented
                options={[{ value: 'lowestPoints', label: 'Last place is wolf' }, { value: 'rotation', label: 'Keep rotating' }]}
                value={draft.wolfLastHoles}
                onChange={(v) => set('wolfLastHoles', v)}
              />
            </OptionRow>
          )}
          <Label>Points</Label>
          {WOLF_POINT_LABELS.map(([k, label]) => (
            <View key={k} style={[styles.row, { justifyContent: 'space-between' }]}>
              <Body style={{ flex: 1 }}>{label}</Body>
              <Stepper value={draft.wolfPoints[k]} min={0} max={20} onChange={(v) => set('wolfPoints', { ...draft.wolfPoints, [k]: v })} />
            </View>
          ))}
        </Card>
      )}

      {draft.kind === 'vegas' && (
        <Card>
          <H2>Vegas</H2>
          <Toggle label="Birdie flips" hint="A birdie flips the other team’s number (high digit first)" value={draft.birdieFlip} onChange={(v) => set('birdieFlip', v)} />
          <OptionRow label="Scores of 10+">
            <Segmented options={[{ value: 'highFirst', label: 'Big number first (104)' }, { value: 'standard', label: 'Low first (410)' }]} value={draft.tenPlusRule} onChange={(v) => set('tenPlusRule', v)} />
          </OptionRow>
        </Card>
      )}

      {draft.kind === 'stableford' && (
        <Card>
          <H2>Stableford</H2>
          <Segmented options={[{ value: 'standard', label: 'Standard' }, { value: 'modified', label: 'Modified' }]} value={draft.stablefordSystem} onChange={(v) => set('stablefordSystem', v)} />
          <Label style={{ textTransform: 'none' }}>
            {draft.stablefordSystem === 'standard'
              ? 'Albatross 5 · Eagle 4 · Birdie 3 · Par 2 · Bogey 1 · Double+ 0'
              : 'Albatross 8 · Eagle 5 · Birdie 2 · Par 0 · Bogey −1 · Double+ −3'}
          </Label>
        </Card>
      )}

      {draft.kind === 'shamble' && (
        <Card>
          <H2>Shamble</H2>
          <OptionRow label="Scores that count per hole">
            <Stepper value={draft.countBest} min={1} max={2} onChange={(v) => set('countBest', v)} />
          </OptionRow>
        </Card>
      )}
    </>
  );
}
