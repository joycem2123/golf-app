import type { GameResult, Player } from '@golf/engine';
import { Text, View } from 'react-native';

import { headline } from '@/lib/headline';
import { fonts, space, useColors } from '@/theme';

/** The big, simple "who's winning" banner pinned to the top of the scorecard. */
export function StatusBanner({
  name,
  result,
  players,
  sideGames,
}: {
  name: string;
  result: GameResult | { error: string } | undefined;
  players: Player[];
  sideGames: { name: string; result: GameResult | { error: string } | undefined }[];
}) {
  const c = useColors();
  if (!result || 'error' in result) return null;
  const h = headline(result, players);
  const color = h.side === 0 ? c.teamA : h.side === 1 ? c.teamB : c.primary;

  return (
    <View style={{ backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: space.lg, paddingVertical: space.md, gap: 2 }}>
      <View style={{ height: 3, backgroundColor: c.accent, marginHorizontal: -space.lg, marginTop: -space.md, marginBottom: space.sm }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: c.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>{name}</Text>
        <Text style={{ color: c.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>{h.small}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: space.sm }}>
        {h.leader ? (
          <Text style={{ fontFamily: fonts.serif, fontSize: 22, fontWeight: '700', color }} numberOfLines={1}>
            {h.leader}
          </Text>
        ) : null}
        <Text style={{ fontFamily: fonts.serif, fontSize: 30, fontWeight: '700', color }}>{h.big}</Text>
      </View>
      {h.extra.map((line) => (
        <Text key={line} style={{ color: c.muted, fontSize: 13 }}>{line}</Text>
      ))}
      {sideGames.map((g, i) => {
        if (!g.result || 'error' in g.result) return null;
        const s = headline(g.result, players);
        const who = g.result.type === 'matchPlay' ? `${g.result.sideA.name} v ${g.result.sideB.name}` : g.name;
        const label = g.result.type === 'matchPlay' && g.name === 'Side match' ? 'SIDE' : g.name.toUpperCase();
        return (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
            <Text style={{ color: c.text, fontSize: 13 }}>
              <Text style={{ color: c.muted, fontWeight: '700', fontSize: 11, letterSpacing: 1 }}>{label}  </Text>
              {who}
            </Text>
            <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{s.leader ? `${s.leader} ${s.big}` : s.big}</Text>
          </View>
        );
      })}
    </View>
  );
}
