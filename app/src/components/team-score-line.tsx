/** A team score on a card: each team in its colour, the leader (or winner) filled in, and who's ahead. */
import { Text, View } from 'react-native';

import { formatPoints } from '@/lib/events';
import { radius, teamColor, useColors } from '@/theme';

export type TeamScore = { letter: string; name: string; points: number };

export function TeamScoreLine({ teams, done, color }: { teams: TeamScore[]; done?: boolean; color?: (letter: string) => string }) {
  const c = useColors();
  const col = (L: string) => color?.(L) ?? teamColor(L).color;
  const sorted = [...teams].sort((a, b) => b.points - a.points);
  const lead = sorted.length >= 2 && sorted[0].points > sorted[1].points ? sorted[0] : null;
  const played = teams.some((t) => t.points > 0);
  const caption = !played ? (done ? 'NO RESULT' : 'NOT STARTED') : lead ? `${lead.name.toUpperCase()} ${done ? 'WON' : 'LEADS'}` : done ? 'TIED' : 'ALL SQUARE';
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {teams.map((t) => {
          const win = lead?.letter === t.letter;
          return (
            <View key={t.letter} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: win ? col(t.letter) : teamColor(t.letter).soft, borderWidth: 1, borderColor: col(t.letter) }}>
              <Text numberOfLines={1} style={{ flexShrink: 1, color: win ? '#fff' : col(t.letter), fontSize: 12, fontWeight: '800' }}>{t.name}{win && done ? ' 🏆' : ''}</Text>
              <Text style={{ color: win ? '#fff' : col(t.letter), fontSize: 18, fontWeight: '800' }}>{formatPoints(t.points)}</Text>
            </View>
          );
        })}
      </View>
      <Text style={{ color: lead ? col(lead.letter) : c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>{caption}</Text>
    </View>
  );
}
