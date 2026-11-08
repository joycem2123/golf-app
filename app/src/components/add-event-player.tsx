/**
 * Add a player to an event that's already under way: pick a friend (or anyone you've played with),
 * or add someone new by name and handicap. Team events ask which team.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Sheet } from '@/components/round-setup';
import { Body, Button, Field, Label, Segmented } from '@/components/ui';
import { formatIndex, parseIndex } from '@/lib/format';
import { useMe } from '@/lib/me';
import { track } from '@/lib/usage';
import { newId, useStore, type EventRecord, type SavedPlayer } from '@/store/store';
import { radius, space, teamColor, useColors } from '@/theme';

export function AddEventPlayer({ e }: { e: EventRecord }) {
  const c = useColors();
  const { isMe } = useMe();
  const saved = useStore((s) => s.players);
  const upsertPlayer = useStore((s) => s.upsertPlayer);
  const addEventPlayer = useStore((s) => s.addEventPlayer);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'pick' | 'new'>('pick');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [index, setIndex] = useState('');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [done, setDone] = useState<string | null>(null);

  // Teams: a Ryder Cup's two teams, or the lettered teams from the event's Teams step.
  const teamOptions: { value: string; label: string; color: string }[] = e.teams
    ? (['A', 'B'] as const).map((t) => ({ value: t, label: e.teams![t].name, color: t === 'A' ? c.teamA : c.teamB }))
    : e.teamOf && (e.teamLetters?.length ?? 0) >= 2
      ? e.teamLetters!.map((L) => ({ value: L, label: `Team ${L}`, color: teamColor(L).color }))
      : [];
  const [team, setTeam] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const choices = saved
    .filter((p) => !e.playerIds.includes(p.id) && (!q || p.name.toLowerCase().includes(q) || (p.username ?? '').includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const parsed = parseIndex(index);
  const ready = (teamOptions.length === 0 || team) && (mode === 'pick' ? !!picked : name.trim().length > 1 && parsed !== null);

  const reset = () => { setMode('pick'); setQuery(''); setPicked(null); setName(''); setIndex(''); setGender('M'); setTeam(null); };
  const add = () => {
    if (!ready) return;
    let id = picked;
    if (mode === 'new') {
      const p: SavedPlayer = { id: newId(), name: name.trim(), handicapIndex: parsed ?? 0, gender };
      upsertPlayer(p);
      id = p.id;
    }
    addEventPlayer(e.id, id!, team ?? undefined);
    const who = mode === 'new' ? name.trim() : (saved.find((p) => p.id === id)?.name ?? 'Player');
    track('event_player_added', { type: e.type, new_player: mode === 'new' });
    setDone(`${who} joined ${e.name}${team ? ` on ${teamOptions.find((t) => t.value === team)?.label}` : ''}.`);
    setOpen(false);
    reset();
  };

  return (
    <>
      <Button small kind="secondary" title="+ Add a player" onPress={() => { setDone(null); setOpen(true); }} />
      {done ? <Body style={{ color: c.primary, textAlign: 'center' }}>✓ {done} Add them to a round’s matchups when it starts.</Body> : null}
      <Sheet visible={open} onClose={() => { setOpen(false); reset(); }} title="Add a player">
        <View style={{ gap: space.md }}>
          {teamOptions.length > 0 && (
            <View style={{ gap: space.xs }}>
              <Label>Which team?</Label>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {teamOptions.map((t) => {
                  const sel = team === t.value;
                  return (
                    <Pressable
                      key={t.value}
                      onPress={() => setTeam(t.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel }}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center', borderWidth: 2, borderColor: t.color, backgroundColor: sel ? t.color : c.card }}>
                      <Text style={{ color: sel ? '#fff' : t.color, fontWeight: '800' }}>{t.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
          <Segmented options={[{ value: 'pick', label: 'Friends & players' }, { value: 'new', label: 'Someone new' }]} value={mode} onChange={setMode} />
          {mode === 'pick' ? (
            <View style={{ gap: space.sm }}>
              {saved.length > 8 && <Field label="Search" value={query} onChangeText={setQuery} placeholder="Name or @username" autoCapitalize="none" />}
              {choices.length === 0 ? (
                <Body muted>Everyone you play with is already in this event. Choose “Someone new”.</Body>
              ) : (
                choices.slice(0, 40).map((p) => {
                  const sel = picked === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setPicked(p.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel }}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: sel ? c.primary : c.border, backgroundColor: sel ? c.primarySoft : c.card }}>
                      <Text style={{ flex: 1, color: c.text, fontSize: 16, fontWeight: '600' }}>{p.name}{isMe(p.id) ? ' (you)' : ''}</Text>
                      <Text style={{ color: c.muted }}>{formatIndex(p.handicapIndex)}</Text>
                      {sel && <Text style={{ color: c.primary, fontWeight: '900', marginLeft: space.sm }}>✓</Text>}
                    </Pressable>
                  );
                })
              )}
            </View>
          ) : (
            <View style={{ gap: space.sm }}>
              <Field label="Name" value={name} onChangeText={setName} placeholder="First and last name" autoCapitalize="words" />
              <Field label="Handicap index" value={index} onChangeText={setIndex} placeholder="12.4 or +1.2" keyboardType="numbers-and-punctuation" />
              {index && parsed === null ? <Text style={{ color: c.danger, fontSize: 12 }}>Enter an index like 12.4 or +1.2</Text> : null}
              <Segmented options={[{ value: 'M', label: "Men's tees" }, { value: 'F', label: "Women's tees" }]} value={gender} onChange={setGender} />
            </View>
          )}
          {e.lockHandicaps && <Label style={{ textTransform: 'none', letterSpacing: 0 }}>Handicaps are locked for this event, so their index today is used for the rest of it.</Label>}
          <Button title="Add to event" disabled={!ready} onPress={add} />
        </View>
      </Sheet>
    </>
  );
}
