import { lockHandicaps } from '@golf/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { FriendSearch } from '@/components/friend-search';
import { Body, Button, Card, Chip, Field, H2, Label, OptionRow, Segmented, Stepper, Toggle, styles } from '@/components/ui';
import { formatIndex, shuffle } from '@/lib/format';
import { meFirst, useMe } from '@/lib/me';
import { newId, useStore, type EventRecord, type EventType } from '@/store/store';
import { space, useColors } from '@/theme';

const TYPES: { value: EventType; label: string; blurb: string }[] = [
  { value: 'trip', label: 'Trip', blurb: 'A few rounds together. Standings from every match played.' },
  { value: 'cup', label: 'Ryder Cup', blurb: 'Two teams play matches for points. Win = 1, halve = ½.' },
  { value: 'season', label: 'Season', blurb: 'Season-long standings and head-to-head records.' },
];

export default function NewEvent() {
  const c = useColors();
  const saved = useStore((s) => s.players);
  const upsertPlayer = useStore((s) => s.upsertPlayer);
  const addEvent = useStore((s) => s.addEvent);

  const [type, setType] = useState<EventType>('trip');
  const [name, setName] = useState('');
  const { me, isMe } = useMe();
  const [ids, setIds] = useState<string[]>(me ? [me.id] : []);
  const [teamOf, setTeamOf] = useState<Record<string, 'A' | 'B'>>(me ? { [me.id]: 'A' } : {});
  const [teamNames, setTeamNames] = useState({ A: 'Team A', B: 'Team B' });
  const [holder, setHolder] = useState<'none' | 'A' | 'B'>('none');
  const [lock, setLock] = useState(true);
  const [cupPoints, setCupPoints] = useState(12);
  const [adding, setAdding] = useState(false);

  const toggle = (id: string) => {
    setIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
    setTeamOf((t) => ({ ...t, [id]: t[id] ?? (Object.values(t).filter((v) => v === 'A').length <= Object.values(t).filter((v) => v === 'B').length ? 'A' : 'B') }));
  };
  const pname = (id: string) => saved.find((p) => p.id === id)?.name ?? '?';
  const teamA = ids.filter((id) => teamOf[id] === 'A');
  const teamB = ids.filter((id) => teamOf[id] !== 'A');
  const problem = !name.trim()
    ? 'Give the event a name'
    : ids.length < 2
      ? 'Add at least 2 players'
      : type === 'cup' && (teamA.length === 0 || teamB.length === 0)
        ? 'Each team needs at least one player'
        : null;

  const create = () => {
    if (problem) return;
    const players = saved.filter((p) => ids.includes(p.id));
    const e: EventRecord = {
      id: newId(),
      name: name.trim(),
      type,
      createdAt: Date.now(),
      playerIds: ids,
      lockHandicaps: lock,
      lockedIndexes: lockHandicaps(players),
      teams: type === 'cup' ? { A: { name: teamNames.A.trim() || 'Team A', playerIds: teamA }, B: { name: teamNames.B.trim() || 'Team B', playerIds: teamB } } : undefined,
      holder: type === 'cup' && holder !== 'none' ? holder : undefined,
      cupPoints: type === 'cup' ? cupPoints : undefined,
      points: { win: 1, halve: 0.5, loss: 0 },
      status: 'active',
    };
    addEvent(e);
    router.replace(`/event/${e.id}`);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <Segmented options={TYPES.map((t) => ({ value: t.value, label: t.label }))} value={type} onChange={(t) => { setType(t); setLock(t !== 'season'); }} />
      <Body muted>{TYPES.find((t) => t.value === type)!.blurb}</Body>

      <Field label="Event name" value={name} onChangeText={setName} placeholder={type === 'cup' ? 'Palm Desert Cup 2027' : type === 'trip' ? 'Boys Trip 2027' : 'Willow Park 2027 Season'} />

      <Card>
        <H2>Players</H2>
        <View style={styles.wrap}>
          {meFirst(saved, isMe).map((p) => (
            <Chip key={p.id} label={`${p.name}${isMe(p.id) ? ' (Me)' : ''} ${formatIndex(p.handicapIndex)}`} selected={ids.includes(p.id)} onPress={() => toggle(p.id)} />
          ))}
        </View>
        {adding ? (
          <FriendSearch onClose={() => setAdding(false)} onAdded={(p) => { if (!ids.includes(p.id)) toggle(p.id); }} />
        ) : (
          <Button small kind="secondary" title="+ Add a friend" onPress={() => setAdding(true)} />
        )}
      </Card>

      {type === 'cup' && ids.length > 0 && (
        <Card>
          <H2>Teams</H2>
          <Label style={{ textTransform: 'none', letterSpacing: 0 }}>Tap a player to switch teams.</Label>
          {(['A', 'B'] as const).map((t) => (
            <View key={t} style={{ gap: space.xs }}>
              <Field label={`Team ${t} name`} value={teamNames[t]} onChangeText={(v) => setTeamNames((n) => ({ ...n, [t]: v }))} />
              <View style={styles.wrap}>
                {(t === 'A' ? teamA : teamB).map((id) => (
                  <Chip key={id} label={pname(id)} selected color={t === 'A' ? c.teamA : c.teamB} onPress={() => setTeamOf((x) => ({ ...x, [id]: t === 'A' ? 'B' : 'A' }))} />
                ))}
              </View>
            </View>
          ))}
          <Button
            small
            kind="secondary"
            title="Randomize teams"
            onPress={() => {
              const half = Math.ceil(ids.length / 2);
              const shuffled = shuffle(ids);
              setTeamOf(Object.fromEntries(shuffled.map((id, i) => [id, i < half ? 'A' : 'B'])));
            }}
          />
          <OptionRow label={`Points available · ${cupPoints / 2 + 0.5} to win`}>
            <Stepper value={cupPoints} min={1} max={60} onChange={setCupPoints} />
            <Label style={{ textTransform: 'none', letterSpacing: 0 }}>One point per match. e.g. 4 players over 3 days: 2 best ball + 2 alternate shot + 4 singles = 8.</Label>
          </OptionRow>
          <OptionRow label="Defending champion (keeps the cup on a tie)">
            <Segmented
              options={[{ value: 'none', label: 'None' }, { value: 'A', label: teamNames.A || 'Team A' }, { value: 'B', label: teamNames.B || 'Team B' }]}
              value={holder}
              onChange={setHolder}
            />
          </OptionRow>
        </Card>
      )}

      <Card>
        <Toggle
          label="Lock handicaps at the start"
          hint="Everyone plays the whole event off today's index, even if it changes on Golf Canada."
          value={lock}
          onChange={setLock}
        />
      </Card>

      {problem && name ? <Body style={{ color: c.danger }}>{problem}</Body> : null}
      <Button title="Create event" disabled={!!problem} onPress={create} />
    </ScrollView>
  );
}
