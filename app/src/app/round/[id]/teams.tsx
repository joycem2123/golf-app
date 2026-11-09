/** Mid-round: move players between teams. Team scores follow straight away; matches between teammates don't count. */
import type { GameConfig } from '@golf/engine';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { TeamEditor } from '@/components/team-editor';
import { Body, Button, Card, H2 } from '@/components/ui';
import { gameTitle, matchLabel } from '@/lib/games';
import { namesFor, teamName } from '@/lib/team-colors';
import { track } from '@/lib/usage';
import { useRound, useStore } from '@/store/store';
import { radius, space, teamColor, useColors } from '@/theme';

/** Both sides of a head-to-head game (members), or null. */
function sides(g: GameConfig): [string[], string[]] | null {
  if (g.type === 'matchPlay' || g.type === 'nassau') return [g.sideA.members, g.sideB.members];
  if (g.type === 'vegas') return [g.teamA.members, g.teamB.members];
  if ((g.type === 'scramble' || g.type === 'shamble') && g.teams.length === 2) return [g.teams[0].members, g.teams[1].members];
  return null;
}

export default function EditRoundTeams() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useRound(id);
  const ev = useStore((s) => s.events.find((e) => e.id === r?.eventId));
  const setRoundTeams = useStore((s) => s.setRoundTeams);
  const [teamOf, setTeamOf] = useState<Record<string, string>>(() => ({ ...(r?.teamOf ?? {}) }));
  if (!r) return <Body>Round not found.</Body>;
  const letters = [...new Set(['A', 'B', ...Object.values(r.teamOf ?? {})])].sort();
  const names = namesFor(r, ev);

  // What each match becomes with these teams.
  const matches = r.games
    .map((g, i) => ({ g, i, s: sides(g) }))
    .filter((x) => x.s && (matchLabel(x.g) || (x.g.id ?? '').startsWith('side-') || r.games.length === 1))
    .map(({ g, i, s }) => {
      const team = (ids: string[]) => (ids.every((x) => teamOf[x] && teamOf[x] === teamOf[ids[0]]) ? teamOf[ids[0]] : null);
      const ta = team(s![0]);
      const tb = team(s![1]);
      return { i, title: gameTitle(g, r.players), ta, tb, counts: !!ta && !!tb && ta !== tb };
    });
  const changed = r.players.some((p) => (r.teamOf?.[p.id] ?? null) !== (teamOf[p.id] ?? null));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 40 }}>
        <Card>
          <H2>Teams for {r.label ?? 'this round'}</H2>
          <Body muted>Move anyone to another team. Scores already entered stay; the team score is worked out again.{ev ? ' This round only; change the event’s teams from the event’s Edit screen.' : ''}</Body>
          <TeamEditor players={r.players} teamOf={teamOf} letters={letters} names={names} picks={r.teamColors} onChange={setTeamOf} />
        </Card>
        {matches.length > 0 && (
          <Card style={{ gap: 6 }}>
            <H2>Matches with these teams</H2>
            {matches.map((m) => (
              <View key={m.i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.border }}>
                <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14 }}>{m.title}</Text>
                {m.counts ? (
                  <Text style={{ fontSize: 12, fontWeight: '800' }}>
                    <Text style={{ color: teamColor(m.ta!, r.teamColors).color }}>{teamName(m.ta!, names)}</Text>
                    <Text style={{ color: c.muted }}> v </Text>
                    <Text style={{ color: teamColor(m.tb!, r.teamColors).color }}>{teamName(m.tb!, names)}</Text>
                  </Text>
                ) : (
                  <View style={{ backgroundColor: c.danger, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>WON’T COUNT</Text>
                  </View>
                )}
              </View>
            ))}
            {matches.some((m) => !m.counts) && <Text style={{ color: c.muted, fontSize: 12 }}>A match only counts toward the team score when the two sides are on different teams.</Text>}
          </Card>
        )}
      </ScrollView>
      <View style={{ padding: space.lg, backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.border }}>
        <Button
          title="Save teams"
          disabled={!changed}
          onPress={() => {
            setRoundTeams(r.id, teamOf);
            track('round_teams_edited', { in_event: !!r.eventId });
            router.back();
          }}
        />
      </View>
    </View>
  );
}
