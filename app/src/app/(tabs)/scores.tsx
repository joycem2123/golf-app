import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { RoundCard } from '@/components/cards';
import { HeadToHeadView } from '@/components/head-to-head-view';
import { TabHeader } from '@/components/tab-header';
import { MeBadge, StatTiles } from '@/components/people';
import { Body, Button, Card, H2, Label, Segmented } from '@/components/ui';
import { toPar } from '@/lib/format';
import { useMe } from '@/lib/me';
import { playerStats, type PlayerStats } from '@/lib/player-stats';
import { courseFor, shortCourseName } from '@/lib/round';
import { useStore } from '@/store/store';
import { fonts, space, useColors } from '@/theme';

type Section = 'rounds' | 'history' | 'h2h';

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

function History() {
  const c = useColors();
  const rounds = useStore((s) => s.rounds);
  const meAliases = useStore((s) => s.meAliases);
  const { me, friends } = useMe();
  const [open, setOpen] = useState<string | null>(null);
  const mine = me ? playerStats(rounds, [me.id, ...meAliases]) : null;

  return (
    <View style={{ gap: space.md }}>
      <Label>My stats</Label>
      {me && mine ? (
        <>
          <StatTiles items={[['Rounds', mine.rounds], ['Average', mine.average ?? '–'], ['Best', mine.best ?? '–']]} />
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <H2>My rounds</H2>
              <MeBadge />
            </View>
            <RoundRows stats={mine} />
          </Card>
        </>
      ) : (
        <Card>
          <Body muted>Add yourself in Profile to see your own stats here.</Body>
          <Button small kind="secondary" title="Go to Profile" onPress={() => router.push('/profile')} />
        </Card>
      )}

      <Label>Friends</Label>
      <Card style={{ paddingVertical: space.sm }}>
        {friends.length === 0 && <Body muted>Add friends in Profile.</Body>}
        <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
          <Label style={{ flex: 1 }}>Friend</Label>
          <Label style={{ width: 50, textAlign: 'right' }}>Rds</Label>
          <Label style={{ width: 54, textAlign: 'right' }}>Avg</Label>
          <Label style={{ width: 46, textAlign: 'right' }}>Best</Label>
        </View>
        {friends.map((f) => {
          const st = playerStats(rounds, [f.id]);
          const isOpen = open === f.id;
          return (
            <View key={f.id} style={{ borderTopWidth: 1, borderTopColor: c.border }}>
              <Pressable onPress={() => setOpen(isOpen ? null : f.id)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm }}>
                  <Text style={{ flex: 1, color: c.text, fontSize: 16, fontWeight: '600' }}>{isOpen ? '▾ ' : '▸ '}{f.name}</Text>
                  <Text style={{ width: 50, textAlign: 'right', color: c.muted }}>{st.rounds}</Text>
                  <Text style={{ width: 54, textAlign: 'right', color: c.text, fontWeight: '700' }}>{st.average ?? '–'}</Text>
                  <Text style={{ width: 46, textAlign: 'right', color: c.text }}>{st.best ?? '–'}</Text>
                </View>
              </Pressable>
              {isOpen && <View style={{ paddingBottom: space.sm }}><RoundRows stats={st} /></View>}
            </View>
          );
        })}
      </Card>
    </View>
  );
}

export default function Scores() {
  const rounds = useStore((s) => s.rounds);
  const [section, setSection] = useState<Section>('rounds');
  const active = rounds.filter((r) => r.status === 'active');
  const done = rounds.filter((r) => r.status === 'complete');

  return (
    <View style={{ flex: 1 }}>
      <TabHeader title="Scores" sub="Live rounds, results and records" />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }}>
        <Segmented
          options={[{ value: 'rounds', label: 'Rounds' }, { value: 'history', label: 'Stats' }, { value: 'h2h', label: 'Head to Head' }]}
          value={section}
          onChange={setSection}
        />
        {section === 'rounds' && (
          <>
            {active.length > 0 && <Label>In progress</Label>}
            {active.map((r) => <RoundCard key={r.id} r={r} />)}
            {done.length > 0 && <Label>Completed</Label>}
            {done.map((r) => <RoundCard key={r.id} r={r} />)}
            {rounds.length === 0 && <Body muted>No rounds yet. Start one from Home.</Body>}
          </>
        )}
        {section === 'history' && <History />}
        {section === 'h2h' && <HeadToHeadView />}
      </ScrollView>
    </View>
  );
}
