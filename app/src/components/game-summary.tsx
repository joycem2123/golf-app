import { half, type GameResult, type Player } from '@golf/engine';
import { View } from 'react-native';

import { toPar } from '@/lib/format';
import { teamIdName } from '@/lib/games';
import { useColors } from '@/theme';
import { Body, Card, H2, Label, styles } from './ui';

function nameFor(id: string, players: Player[]) {
  return teamIdName(id) ?? players.find((p) => p.id === id)?.name ?? id;
}

function Details({ result, players }: { result: GameResult; players: Player[] }) {
  switch (result.type) {
    case 'nassau':
      return (
        <View>
          {result.segments.map((s) => (
            <Body key={s.segment} muted>
              {s.segment[0].toUpperCase() + s.segment.slice(1)}{s.value > 1 ? ` (${s.value} pts)` : ''}: {s.status.lead === 0 ? s.status.display : `${s.status.lead > 0 ? 'A' : 'B'} ${s.status.display}`}
            </Body>
          ))}
          {result.presses.map((p, i) => (
            <Body key={i} muted>
              Press {p.segment} from #{p.startHole}: {p.status.lead === 0 ? p.status.display : `${p.status.lead > 0 ? 'A' : 'B'} ${p.status.display}`}
            </Body>
          ))}
          <Body bold>Points: A {half(result.points.A)} – B {half(result.points.B)}</Body>
        </View>
      );
    case 'skins': {
      const carrying = result.holes.at(-1)?.status === 'carried' ? result.holes.at(-1)!.value : 0;
      return (
        <View>
          {result.holes.filter((h) => h.winnerId).map((h) => (
            <Body key={h.hole} muted>
              #{h.hole} {nameFor(h.winnerId!, players)} {h.value > 1 ? `(${h.value} skins)` : ''}{h.status === 'pending' ? ' — needs validating' : h.status === 'notValidated' ? ' — not validated' : ''}
            </Body>
          ))}
          {carrying > 0 && !result.finished ? <Body bold>{carrying} skin{carrying > 1 ? 's' : ''} riding on the next hole</Body> : null}
        </View>
      );
    }
    case 'wolf':
      return result.nextWolfId ? <Body muted>Next wolf: {nameFor(result.nextWolfId, players)}</Body> : null;
    default:
      return null;
  }
}

export function GameSummaryCard({ name, result, players }: { name: string; result: GameResult | { error: string } | undefined; players: Player[] }) {
  const c = useColors();
  if (!result) return null;
  if ('error' in result) {
    return (
      <Card>
        <H2>{name}</H2>
        <Body style={{ color: c.danger }}>{result.error}</Body>
      </Card>
    );
  }
  const showStandings = result.standings.length > 2 || result.type === 'stableford' || result.type === 'strokePlay';
  const unit =
    result.type === 'skins' ? 'skins' : result.type === 'wolf' || result.type === 'stableford' || result.type === 'vegas' || result.type === 'nassau' ? 'pts' : '';
  const isStroke = result.type === 'strokePlay' || result.type === 'scramble' || result.type === 'shamble';

  return (
    <Card style={result.finished ? { borderColor: c.primary, borderWidth: 1.5 } : undefined}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Label>{name}</Label>
        <Label>{result.finished ? 'Final' : result.thru ? `Thru ${result.thru}` : ''}</Label>
      </View>
      <H2>{result.summary.replace(/\bteamA\b/g, 'Team A').replace(/\bteamB\b/g, 'Team B')}</H2>
      {showStandings &&
        result.standings.map((s) => (
          <View key={s.id} style={[styles.row, { justifyContent: 'space-between' }]}>
            <Body>{s.position}. {nameFor(s.id, players)}</Body>
            <Body bold>{isStroke ? toPar(s.value) : `${s.value} ${Math.abs(s.value) === 1 ? unit.replace(/s$/, '') : unit}`}</Body>
          </View>
        ))}
      <Details result={result} players={players} />
    </Card>
  );
}
