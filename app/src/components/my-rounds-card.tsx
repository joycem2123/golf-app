/** Profile → My rounds: every round I've finished, newest first, with my score and score to par. */
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { MeBadge } from '@/components/people';
import { Body, Card, H2, Label } from '@/components/ui';
import { toPar } from '@/lib/format';
import type { PlayerStats } from '@/lib/player-stats';
import { courseFor, shortCourseName } from '@/lib/round';
import { fonts, space, useColors } from '@/theme';

function RoundRows({ stats }: { stats: PlayerStats }) {
  const c = useColors();
  if (stats.rows.length === 0) return <Body muted>No finished rounds yet.</Body>;
  return (
    <>
      {stats.rows.map(({ round: r, gross, holes, toPar: tp, teeName }) => (
        <Pressable key={r.id} onPress={() => router.push(`/round/${r.id}/results`)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <View style={{ flex: 1 }}>
              <Body>{shortCourseName(courseFor(r).name)}</Body>
              <Label style={{ letterSpacing: 0.5 }}>
                {new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {teeName}{holes < 18 ? ` · ${holes} holes` : ''}
              </Label>
            </View>
            <Text style={{ fontFamily: fonts.serif, fontSize: 22, fontWeight: '700', color: c.text, width: 48, textAlign: 'right' }}>{gross}</Text>
            <Text style={{ width: 44, textAlign: 'right', color: tp < 0 ? c.under : c.muted, fontWeight: '700' }}>{toPar(tp)}</Text>
          </View>
        </Pressable>
      ))}
    </>
  );
}

export function MyRoundsCard({ stats }: { stats: PlayerStats }) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <H2>My rounds</H2>
        <MeBadge />
      </View>
      <RoundRows stats={stats} />
    </Card>
  );
}
