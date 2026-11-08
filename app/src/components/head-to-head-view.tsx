import { headToHead, type Record3 } from '@golf/engine';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { formatName } from '@/lib/events';
import { normalizeMe, useMe } from '@/lib/me';
import { useStore } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';
import { Sheet } from './round-setup';
import { Body, Card, Field, H2, Label, Segmented, styles } from './ui';

/** A drop-down to pick one player (opens a list, with search for long lists). */
function PlayerDropdown({ label, value, options, onChange }: { label: string; value: string | null; options: { id: string; name: string }[]; onChange: (id: string) => void }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const chosen = options.find((p) => p.id === value);
  const list = options.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${chosen?.name ?? 'choose a player'}`}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.chip, paddingVertical: 10, paddingHorizontal: 12, opacity: pressed ? 0.7 : 1 })}>
        <Text numberOfLines={1} style={{ flex: 1, color: chosen ? c.text : c.muted, fontSize: 16, fontWeight: '600' }}>{chosen?.name ?? 'Choose a player'}</Text>
        <Text style={{ color: c.primary, fontSize: 14 }}>▾</Text>
      </Pressable>
      <Sheet visible={open} onClose={() => { setOpen(false); setQ(''); }} title={label}>
        <View style={{ gap: space.sm }}>
          {options.length > 8 && <Field label="Search" value={q} onChangeText={setQ} placeholder="Name" />}
          {list.map((p) => {
            const sel = p.id === value;
            return (
              <Pressable key={p.id} onPress={() => { onChange(p.id); setOpen(false); setQ(''); }} accessibilityRole="button" accessibilityState={{ selected: sel }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ flex: 1, color: c.text, fontSize: 16, fontWeight: sel ? '700' : '500' }}>{p.name}</Text>
                {sel && <Text style={{ color: c.primary, fontSize: 18, fontWeight: '900' }}>✓</Text>}
              </Pressable>
            );
          })}
          {list.length === 0 && <Body muted>No one matches “{q}”.</Body>}
        </View>
      </Sheet>
    </>
  );
}

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

  if (friends.length === 0) return <Body muted>Add friends in Profile to track head-to-head records.</Body>;

  return (
    <View style={{ gap: space.md }}>
      {me && (
        <Segmented options={[{ value: 'me', label: 'Me vs a friend' }, { value: 'friends', label: 'Two friends' }]} value={mode} onChange={setMode} />
      )}
      <Card>
        {mode === 'friends' ? (
          <View style={[styles.row, { gap: space.sm, alignItems: 'center' }]}>
            <PlayerDropdown label="Friend" value={a} options={friends.filter((p) => p.id !== b)} onChange={setA} />
            <Text style={{ color: c.muted, fontWeight: '700' }}>vs</Text>
            <PlayerDropdown label="Against" value={b} options={friends.filter((p) => p.id !== a)} onChange={setB} />
          </View>
        ) : (
          <View style={[styles.row, { gap: space.sm, alignItems: 'center' }]}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>Me against</Text>
            <PlayerDropdown label="Me against" value={right} options={friends} onChange={setB} />
          </View>
        )}
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
