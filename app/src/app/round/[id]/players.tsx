/**
 * Mid-round: someone else actually played (we put Dave in, it was Mitch). Swap the player and keep
 * the scores already entered, their matches and their team.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Body, Button, Card, Field, H2 } from '@/components/ui';
import { formatIndex } from '@/lib/format';
import { track } from '@/lib/usage';
import { newId, useRound, useStore } from '@/store/store';
import { radius, space, useColors } from '@/theme';

export default function ChangeRoundPlayer() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useRound(id);
  const saved = useStore((s) => s.players);
  const ev = useStore((s) => s.events.find((e) => e.id === r?.eventId));
  const replace = useStore((s) => s.replaceRoundPlayer);
  const upsertPlayer = useStore((s) => s.upsertPlayer);
  const addEventPlayer = useStore((s) => s.addEventPlayer);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [newIndex, setNewIndex] = useState('');
  if (!r) return <Body>Round not found.</Body>;
  const out = r.players.find((p) => p.id === swapping);

  const choose = (p: { id: string; name: string; handicapIndex: number }) => {
    if (!out) return;
    replace(r.id, out.id, p);
    // In an event, the new player joins it (on the same team as the person they replaced).
    if (ev && !ev.playerIds.includes(p.id)) addEventPlayer(ev.id, p.id, r.teamOf?.[out.id]);
    track('round_player_swapped', { in_event: !!ev });
    router.back();
  };

  if (out) {
    const inRound = new Set(r.players.map((p) => p.id));
    const q = query.trim().toLowerCase();
    // Event players first, then everyone else I know.
    const pool = saved
      .filter((p) => !inRound.has(p.id) && !p.pending && (!q || p.name.toLowerCase().includes(q)))
      .sort((a, b) => Number(ev?.playerIds.includes(b.id) ?? 0) - Number(ev?.playerIds.includes(a.id) ?? 0) || a.name.localeCompare(b.name));
    const idx = Number(newIndex.replace('+', '-'));
    const canAdd = newName.trim().length > 1 && newIndex.trim() !== '' && !Number.isNaN(idx) && idx >= -10 && idx <= 54;
    return (
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={{ backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.md }}>
          <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>
            <Text style={{ fontWeight: '800' }}>Who played instead of {out.name}?</Text> Their scores so far, matches{r.teamOf?.[out.id] ? ' and team' : ''} move to the person you pick.
          </Text>
        </View>
        <Field label="Search" value={query} onChangeText={setQuery} onClear={() => setQuery('')} placeholder="Name" />
        <Card style={{ paddingVertical: space.xs }}>
          {pool.length === 0 && <Body muted>No one else to pick. Add them below.</Body>}
          {pool.map((p, i) => (
            <Pressable key={p.id} onPress={() => choose({ id: p.id, name: p.name, handicapIndex: ev?.lockHandicaps ? (ev.lockedIndexes[p.id] ?? p.handicapIndex) : p.handicapIndex })} accessibilityRole="button" accessibilityLabel={`${p.name} played instead`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: c.border, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ flex: 1, color: c.text, fontSize: 16, fontWeight: '600' }}>{p.name}</Text>
              {ev?.playerIds.includes(p.id) ? <Text style={{ color: c.accent, fontSize: 11, fontWeight: '800', marginRight: space.sm }}>IN EVENT</Text> : null}
              <Text style={{ color: c.muted }}>{formatIndex(p.handicapIndex)}</Text>
            </Pressable>
          ))}
        </Card>
        <Card style={{ gap: space.sm }}>
          <H2>Someone new</H2>
          <Field label="Name" value={newName} onChangeText={setNewName} placeholder="Mitch Smith" />
          <Field label="Handicap index" value={newIndex} onChangeText={setNewIndex} placeholder="12.4 or +1.2" keyboardType="numbers-and-punctuation" />
          <Button title="Use this player" disabled={!canAdd} onPress={() => {
            const p = { id: newId(), name: newName.trim(), handicapIndex: idx, gender: 'M' as const, notFriend: true };
            upsertPlayer(p);
            choose(p);
          }} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
      <Card>
        <H2>Change a player</H2>
        <Body muted>Put the wrong person in? Pick who to swap out. Scores already entered stay with that spot.</Body>
        {r.players.map((p, i) => (
          <Pressable key={p.id} onPress={() => setSwapping(p.id)} accessibilityRole="button" accessibilityLabel={`Change ${p.name}`}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: c.border, opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ flex: 1, color: c.text, fontSize: 16, fontWeight: '600' }}>{p.name}</Text>
            <Text style={{ color: c.primary, fontWeight: '700' }}>Change ›</Text>
          </Pressable>
        ))}
      </Card>
    </ScrollView>
  );
}
