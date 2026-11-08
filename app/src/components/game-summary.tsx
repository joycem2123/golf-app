import { half, type GameResult, type Player } from '@golf/engine';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

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

export type CardSide = { team: string; names: string; color: string };

export function GameSummaryCard({ name, result, players, sides }: { name: string; result: GameResult | { error: string } | undefined; players: Player[]; sides?: [CardSide, CardSide] }) {
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
        <Text style={{ flex: 1, color: c.text, fontWeight: '700', fontSize: 14 }} numberOfLines={2}>{name}</Text>
        <Label>{result.finished ? 'Final' : result.thru ? `Thru ${result.thru}` : ''}</Label>
      </View>
      {sides && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {sides.map((sd, j) => (
            <View key={j} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {j === 1 && <Text style={{ color: c.muted, fontSize: 12 }}>vs</Text>}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: sd.color + '1A', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sd.color }} />
                <Text style={{ color: sd.color, fontWeight: '800', fontSize: 12 }}>{sd.team}</Text>
                <Text style={{ color: c.text, fontSize: 12 }}>{sd.names}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
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

/**
 * Match cards. With a limit, the first `limit` show and Expand shows the rest.
 * With collapsed, they all start hidden behind an "All matches" bar.
 */
export function GameSummaryList({
  items,
  players,
  limit = 4,
  collapsed,
}: {
  items: { key: string | number; name: string; result: GameResult | { error: string } | undefined; sides?: [CardSide, CardSide] }[];
  players: Player[];
  limit?: number;
  collapsed?: boolean;
}) {
  const c = useColors();
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const cards = (list: typeof items) => list.map((x) => <GameSummaryCard key={x.key} name={x.name} result={x.result} players={players} sides={x.sides} />);
  const toggle = (label: string) => (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      style={({ pressed }) => ({ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: c.primary, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: c.primary, fontSize: 12 }}>{expanded ? '▲' : '▼'}</Text>
    </Pressable>
  );

  if (collapsed) {
    return (
      <>
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`All matches, ${items.length}. ${expanded ? 'Collapse' : 'Expand'}`}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>All matches ({items.length})</Text>
          <Text style={{ color: c.primary, fontWeight: '700' }}>{expanded ? 'Collapse ▲' : 'Expand ▼'}</Text>
        </Pressable>
        {expanded && cards(items)}
        {expanded && items.length > 2 && toggle('Collapse')}
      </>
    );
  }

  const hidden = items.length - limit;
  return (
    <>
      {cards(expanded ? items : items.slice(0, limit))}
      {hidden > 0 && toggle(expanded ? 'Collapse' : `Expand (${hidden} more)`)}
    </>
  );
}
