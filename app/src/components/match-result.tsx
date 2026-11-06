import type { GameResult } from '@golf/engine';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { requestAiStory } from '@/lib/ai-story';
import type { MatchOutcome, ResultSide } from '@/lib/results';
import { localStory, type StoryHole } from '@/lib/story';
import type { RoundRecord } from '@/store/store';
import { radius, space, teamColor, useColors } from '@/theme';
import { MeBadge } from './people';

/** One side of a match: filled in its team colour (with a trophy) when it won, greyed when it lost. */
export function SideRow({ m, s, which, showTeam, me }: { m: MatchOutcome; s: ResultSide; which: 'a' | 'b'; showTeam: boolean; me: boolean }) {
  const c = useColors();
  const tc = teamColor(s.letter);
  const won = m.winner === which;
  const lost = !!m.winner && m.winner !== which && m.winner !== 'halved';
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 10, paddingHorizontal: space.md, borderRadius: radius.md,
        backgroundColor: won ? tc.color : m.winner === 'halved' ? tc.soft : c.card,
        borderWidth: won ? 0 : 1, borderColor: c.border, borderLeftWidth: 4, borderLeftColor: tc.color,
      }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {showTeam && <Text style={{ color: won ? '#ffffffcc' : tc.color, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }}>TEAM {s.letter}</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: won ? '#fff' : lost ? c.muted : c.text, fontSize: 16, fontWeight: won ? '800' : '600' }}>{s.names}</Text>
          {me && <MeBadge small />}
        </View>
      </View>
      {won && <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>🏆 {m.detail}</Text>}
    </View>
  );
}

/**
 * The story of a match. Shows a story written from the results straight away; once the match
 * is finished, asks for an AI-written one (saved on the round, so it's only written once).
 */
export function MatchStory({ r, res, m, holes, compact }: { r: RoundRecord; res: GameResult; m: MatchOutcome; holes: StoryHole[]; compact?: boolean }) {
  const c = useColors();
  const gameId = r.games[m.gi].id ?? String(m.gi);
  const saved = r.stories?.[gameId];
  const [loading, setLoading] = useState(false);
  const finished = m.winner !== null;

  useEffect(() => {
    if (saved || !finished) return;
    let live = true;
    setLoading(true);
    requestAiStory(r, res, m, holes).finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, finished, r.id, gameId]);

  return (
    <View style={{ backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.md, gap: 4, borderLeftWidth: 3, borderLeftColor: c.accent }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: c.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>{saved ? '✨ THE STORY' : 'THE STORY'}</Text>
        {loading && !saved && <ActivityIndicator size="small" color={c.accent} />}
      </View>
      <Text style={{ color: c.text, fontSize: compact ? 14 : 15, lineHeight: compact ? 20 : 22 }}>{saved ?? localStory(m, holes)}</Text>
      {saved && !compact && <Text style={{ color: c.muted, fontSize: 11 }}>Written by AI from the hole-by-hole scores.</Text>}
    </View>
  );
}
