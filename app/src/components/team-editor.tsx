/** Move players between teams: each player with a button per team (in the team's colour and name). */
import { Pressable, Text, View } from 'react-native';

import { teamName } from '@/lib/team-colors';
import { radius, space, teamColor, useColors, type TeamPicks } from '@/theme';

export function TeamEditor({
  players,
  teamOf,
  letters,
  names,
  picks,
  onChange,
}: {
  players: { id: string; name: string }[];
  teamOf: Record<string, string>;
  letters: string[];
  names?: Record<string, string>;
  picks?: TeamPicks;
  onChange: (t: Record<string, string>) => void;
}) {
  const c = useColors();
  return (
    <View>
      {players.map((p, i) => (
        <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
          <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 16, fontWeight: '600' }}>{p.name}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {letters.map((L) => {
              const tc = teamColor(L, picks);
              const on = teamOf[p.id] === L;
              return (
                <Pressable
                  key={L}
                  onPress={() => onChange({ ...teamOf, [p.id]: L })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${p.name} on ${teamName(L, names)}`}
                  hitSlop={4}
                  style={{ maxWidth: 110, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1.5, borderColor: tc.color, backgroundColor: on ? tc.color : c.card }}>
                  <Text numberOfLines={1} style={{ color: on ? '#fff' : tc.color, fontWeight: '800', fontSize: 12 }}>{teamName(L, names)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
