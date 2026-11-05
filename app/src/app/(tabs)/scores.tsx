import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { RoundCard } from '@/components/cards';
import { HeadToHeadView } from '@/components/head-to-head-view';
import { TabHeader } from '@/components/tab-header';
import { Body, Card, Chip, H2, Label, Segmented, styles } from '@/components/ui';
import { toPar } from '@/lib/format';
import { courseFor, grossAt, shortCourseName, teeFor } from '@/lib/round';
import { useStore } from '@/store/store';
import { fonts, space, useColors } from '@/theme';

type Section = 'rounds' | 'history' | 'h2h';

function History() {
  const c = useColors();
  const players = useStore((s) => s.players);
  const rounds = useStore((s) => s.rounds);
  const [pid, setPid] = useState<string | null>(players[0]?.id ?? null);

  const rows = rounds
    .filter((r) => r.status === 'complete' && r.players.some((p) => p.id === pid))
    .map((r) => {
      const scores = Array.from({ length: 18 }, (_, i) => grossAt(r, pid!, i + 1));
      const played = scores.filter((s): s is number => s !== null);
      const tee = teeFor(r, pid!);
      const par = tee.holes.reduce((s, h, i) => s + (scores[i] !== null ? h.par : 0), 0);
      const gross = played.reduce((a, b) => a + b, 0);
      return { r, gross, holes: played.length, toPar: gross - par, tee };
    })
    .filter((x) => x.holes > 0);
  const full = rows.filter((x) => x.holes === 18);
  const avg = full.length ? Math.round((full.reduce((s, x) => s + x.gross, 0) / full.length) * 10) / 10 : null;
  const best = full.length ? Math.min(...full.map((x) => x.gross)) : null;

  if (players.length === 0) return <Body muted>Add players and finish a round to build score history.</Body>;

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.wrap}>
        {players.map((p) => <Chip key={p.id} label={p.name} selected={p.id === pid} onPress={() => setPid(p.id)} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {[
          ['Rounds', String(rows.length)],
          ['Average', avg !== null ? String(avg) : '–'],
          ['Best', best !== null ? String(best) : '–'],
        ].map(([label, value]) => (
          <Card key={label} style={{ flex: 1, alignItems: 'center', paddingVertical: space.md }}>
            <Label>{label}</Label>
            <Text style={{ fontFamily: fonts.serif, fontSize: 28, fontWeight: '700', color: c.primary }}>{value}</Text>
          </Card>
        ))}
      </View>
      <Card>
        <H2>Rounds</H2>
        {rows.length === 0 ? (
          <Body muted>No finished rounds yet.</Body>
        ) : (
          rows.map(({ r, gross, holes, toPar: tp, tee }) => (
            <Pressable key={r.id} onPress={() => router.push(`/round/${r.id}/results`)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <View style={{ flex: 1 }}>
                  <Body>{shortCourseName(courseFor(r).name)}</Body>
                  <Label style={{ letterSpacing: 0.5 }}>
                    {new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {tee.name}{holes < 18 ? ` · ${holes} holes` : ''}
                  </Label>
                </View>
                <Text style={{ fontFamily: fonts.serif, fontSize: 22, fontWeight: '700', color: c.text, width: 48, textAlign: 'right' }}>{gross}</Text>
                <Text style={{ width: 44, textAlign: 'right', color: tp < 0 ? c.under : c.muted, fontWeight: '700' }}>{toPar(tp)}</Text>
              </View>
            </Pressable>
          ))
        )}
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
          options={[{ value: 'rounds', label: 'Rounds' }, { value: 'history', label: 'History' }, { value: 'h2h', label: 'Head to Head' }]}
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
