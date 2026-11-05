import { headToHead, type Record3 } from '@golf/engine';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Body, Card, Chip, H2, Label, styles } from '@/components/ui';
import { formatName } from '@/lib/events';
import { useStore } from '@/store/store';
import { fonts, space, useColors } from '@/theme';

function RecordLine({ label, r }: { label: string; r: Record3 }) {
  const c = useColors();
  const n = r.wins + r.losses + r.halves;
  return (
    <View style={[styles.row, { justifyContent: 'space-between', paddingVertical: 4 }]}>
      <Body>{label}</Body>
      <Text style={{ fontFamily: fonts.serif, fontSize: 17, fontWeight: '700', color: n ? c.text : c.muted }}>
        {n ? `${r.wins}-${r.losses}-${r.halves}` : '–'}
      </Text>
    </View>
  );
}

export default function HeadToHead() {
  const c = useColors();
  const players = useStore((s) => s.players);
  const history = useStore((s) => s.history);
  const [a, setA] = useState<string | null>(players[0]?.id ?? null);
  const [b, setB] = useState<string | null>(players[1]?.id ?? null);
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const h = a && b && a !== b ? headToHead(history, a, b) : null;

  const picker = (value: string | null, set: (id: string) => void, other: string | null) => (
    <View style={styles.wrap}>
      {players.filter((p) => p.id !== other).map((p) => (
        <Chip key={p.id} label={p.name} selected={p.id === value} onPress={() => set(p.id)} />
      ))}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}>
      <Card>
        <Label>Player</Label>
        {picker(a, setA, b)}
        <Label>Against</Label>
        {picker(b, setB, a)}
      </Card>

      {h && (
        <>
          <Card>
            <Text style={{ textAlign: 'center', fontFamily: fonts.serif, fontSize: 22, fontWeight: '700', color: c.primary }}>
              {name(h.playerA)} v {name(h.playerB)}
            </Text>
            <Text style={{ textAlign: 'center', fontFamily: fonts.serif, fontSize: 44, fontWeight: '700', color: c.text }}>
              {h.overall.wins}–{h.overall.losses}{h.overall.halves ? `–${h.overall.halves}` : ''}
            </Text>
            <Label style={{ textAlign: 'center' }}>{name(h.playerA)}'s record (W-L-H)</Label>
          </Card>
          <Card>
            <RecordLine label="Singles" r={h.singles} />
            <RecordLine label="Team matches (opponents)" r={h.team} />
            <RecordLine label="As partners" r={h.asPartners} />
          </Card>
          <Card>
            <H2>Matches</H2>
            {h.matches.length === 0 ? (
              <Body muted>No finished matches between them yet.</Body>
            ) : (
              [...h.matches].reverse().map((m) => (
                <View key={m.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border }}>
                  <Label>{m.date} · {formatName(m.format)}</Label>
                  <Body>{m.sideA.map(name).join(' & ')} v {m.sideB.map(name).join(' & ')}</Body>
                  {m.summary ? <Body muted>{m.summary}</Body> : null}
                </View>
              ))
            )}
          </Card>
        </>
      )}
      {players.length < 2 && <Body muted>Add at least two players to compare records.</Body>}
    </ScrollView>
  );
}
