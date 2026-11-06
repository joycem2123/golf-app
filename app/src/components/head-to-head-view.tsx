import { headToHead, type Record3 } from '@golf/engine';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { formatName } from '@/lib/events';
import { normalizeMe, useMe } from '@/lib/me';
import { useStore } from '@/store/store';
import { fonts, space, useColors } from '@/theme';
import { Body, Card, Chip, H2, Label, Segmented, styles } from './ui';

function RecordLine({ label, r }: { label: string; r: Record3 }) {
  const c = useColors();
  const n = r.wins + r.losses + r.halves;
  return (
    <View style={[styles.row, { justifyContent: 'space-between', paddingVertical: 4 }]}>
      <Body>{label}</Body>
      <Text style={{ fontFamily: fonts.serif, fontSize: 17, fontWeight: '700', color: n ? c.text : c.muted }}>{n ? `${r.wins}-${r.losses}-${r.halves}` : '–'}</Text>
    </View>
  );
}

export function HeadToHeadView() {
  const c = useColors();
  const players = useStore((s) => s.players);
  const rawHistory = useStore((s) => s.history);
  const meAliases = useStore((s) => s.meAliases);
  const { me, friends } = useMe();
  const history = normalizeMe(rawHistory, me?.id ?? null, meAliases);
  const [mode, setMode] = useState<'me' | 'friends'>(me ? 'me' : 'friends');
  const [a, setA] = useState<string | null>(friends[0]?.id ?? null);
  const [b, setB] = useState<string | null>(friends[1]?.id ?? friends[0]?.id ?? null);
  const name = (id: string) => (me && id === me.id ? 'Me' : (players.find((p) => p.id === id)?.name ?? '?'));

  const left = mode === 'me' && me ? me.id : a;
  const right = mode === 'me' ? (b ?? friends[0]?.id ?? null) : b;
  const h = left && right && left !== right ? headToHead(history, left, right) : null;

  const picker = (value: string | null, set: (id: string) => void, other: string | null) => (
    <View style={styles.wrap}>
      {friends.filter((p) => p.id !== other).map((p) => (
        <Chip key={p.id} label={p.name} selected={p.id === value} onPress={() => set(p.id)} />
      ))}
    </View>
  );

  if (friends.length === 0) return <Body muted>Add friends in Profile to track head-to-head records.</Body>;

  return (
    <View style={{ gap: space.md }}>
      {me && (
        <Segmented options={[{ value: 'me', label: 'Me vs a friend' }, { value: 'friends', label: 'Two friends' }]} value={mode} onChange={setMode} />
      )}
      <Card>
        {mode === 'friends' && (
          <>
            <Label>Friend</Label>
            {picker(a, setA, b)}
          </>
        )}
        <Label>{mode === 'me' ? 'Me against' : 'Against'}</Label>
        {picker(right, setB, mode === 'me' ? null : a)}
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
            <Label style={{ textAlign: 'center' }}>{mode === 'me' ? 'My record' : `${name(h.playerA)}'s record`} (W-L-H)</Label>
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
    </View>
  );
}
