import type { Player } from '@golf/engine';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { shuffle } from '@/lib/format';
import { buildMatches, teamSizesFor, type GameDraft, type Matchup } from '@/lib/games';
import { fonts, radius, space, useColors } from '@/theme';
import { Sheet } from './round-setup';
import { Card, H2, Label, Segmented } from './ui';

type Slot = { match: number; side: 'a' | 'b'; pos: number };

/** Empty slots are '' so a team sheet can be filled in any order. */
const pad = (ids: string[], n: number) => [...ids, ...Array(Math.max(0, n - ids.length)).fill('')].slice(0, n);

/**
 * Team sheet: each match is a card with Team A and Team B side by side.
 * Tap an empty slot to pick a player; tap × to take a player out.
 */
export function MatchupsEditor({
  draft,
  players,
  onChange,
  teamOf,
}: {
  draft: GameDraft;
  players: Player[];
  onChange: (d: GameDraft) => void;
  teamOf?: (id: string) => 'A' | 'B' | undefined;
}) {
  const c = useColors();
  const [slot, setSlot] = useState<Slot | null>(null);
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  /** "Braydon Cole" → "Braydon C." so names fit two columns on a phone. */
  const short = (id: string) => {
    const [first, ...rest] = name(id).split(' ');
    return rest.length ? `${first} ${rest[rest.length - 1].slice(0, 1)}.` : first;
  };
  const ids = players.map((p) => p.id);
  const sizes = teamSizesFor(draft.kind, players.length);
  const cup = !!teamOf && ids.some((id) => teamOf(id));
  const n = draft.teamSize;
  const matchCount = Math.max(1, Math.floor(players.length / (2 * n)));
  const matches: Matchup[] = Array.from({ length: matchCount }, (_, i) => ({
    a: pad(draft.matches[i]?.a ?? [], n),
    b: pad(draft.matches[i]?.b ?? [], n),
  }));
  const placed = new Set(matches.flatMap((m) => [...m.a, ...m.b]).filter(Boolean));
  const unassigned = ids.filter((id) => !placed.has(id));

  const save = (next: Matchup[]) => onChange({ ...draft, matches: next });
  const fill = (order: string[]) => onChange({ ...draft, matches: buildMatches(order, n, teamOf) });
  const autoFill = () => fill(ids);
  const shuffleAll = () =>
    fill(cup ? [...shuffle(ids.filter((id) => teamOf!(id) === 'A')), ...shuffle(ids.filter((id) => teamOf!(id) !== 'A'))] : shuffle(ids));
  const clear = () => save(matches.map(() => ({ a: pad([], n), b: pad([], n) })));
  const setSize = (size: number) => onChange({ ...draft, teamSize: size, matches: buildMatches(ids, size, teamOf) });

  const removeAt = (s: Slot) =>
    save(matches.map((m, i) => (i !== s.match ? m : { ...m, [s.side]: m[s.side].map((x, k) => (k === s.pos ? '' : x)) })));

  /** Put a player in the chosen slot (moving them out of wherever they were). */
  const place = (id: string) => {
    if (!slot) return;
    const next = matches.map((m) => ({ a: m.a.map((x) => (x === id ? '' : x)), b: m.b.map((x) => (x === id ? '' : x)) }));
    next[slot.match][slot.side][slot.pos] = id;
    save(next);
    setSlot(null);
  };

  // Who can go in the open slot: cups only allow that side's team.
  const allowed = (id: string, side: 'a' | 'b') => !cup || teamOf!(id) === (side === 'a' ? 'A' : 'B');
  const whereIs = (id: string) => {
    const i = matches.findIndex((m) => m.a.includes(id) || m.b.includes(id));
    return i < 0 ? null : `Match ${i + 1}`;
  };

  const sideCol = (m: Matchup, mi: number, side: 'a' | 'b') => {
    const color = side === 'a' ? c.teamA : c.teamB;
    const soft = side === 'a' ? c.teamASoft : c.teamBSoft;
    return (
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        {n > 1 && <Text style={{ color, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>{side === 'a' ? 'TEAM A' : 'TEAM B'}</Text>}
        {m[side].map((id, pos) =>
          id ? (
            <View
              key={pos}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: soft, borderRadius: radius.md, paddingVertical: 11, paddingLeft: 10, paddingRight: 2, borderLeftWidth: 3, borderLeftColor: color }}>
              <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => setSlot({ match: mi, side, pos })} accessibilityLabel={`Change ${name(id)}`}>
                <Text numberOfLines={1} style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>{short(id)}</Text>
              </Pressable>
              <Pressable hitSlop={8} onPress={() => removeAt({ match: mi, side, pos })} accessibilityRole="button" accessibilityLabel={`Remove ${name(id)}`} style={{ paddingHorizontal: 6 }}>
                <Text style={{ color: c.muted, fontSize: 16 }}>×</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              key={pos}
              accessibilityRole="button"
              accessibilityLabel={`Add player to match ${mi + 1} ${side === 'a' ? 'Team A' : 'Team B'}`}
              onPress={() => setSlot({ match: mi, side, pos })}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11,
                borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color, opacity: pressed ? 0.6 : 1,
              })}>
              <Text style={{ color, fontWeight: '700', fontSize: 14 }}>+ Add player</Text>
            </Pressable>
          ),
        )}
      </View>
    );
  };

  const action = (title: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={6} style={({ pressed }) => ({ paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: c.chip, opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13 }}>{title}</Text>
    </Pressable>
  );

  const options = slot ? ids.filter((id) => allowed(id, slot.side) && matches[slot.match][slot.side][slot.pos] !== id) : [];
  const free = options.filter((id) => !placed.has(id));
  const taken = options.filter((id) => placed.has(id));

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <H2>Teams</H2>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {action('Auto-fill', autoFill)}
          {action('Shuffle', shuffleAll)}
          {action('Clear', clear)}
        </View>
      </View>

      {sizes.length > 1 && (
        <Segmented
          options={sizes.map((s) => ({ value: String(s), label: `${s} v ${s}` }))}
          value={String(n)}
          onChange={(v) => setSize(Number(v))}
        />
      )}

      {unassigned.length > 0 && (
        <View style={{ backgroundColor: c.chip, borderRadius: radius.md, padding: space.md, gap: 6 }}>
          <Label>Unassigned · {unassigned.length}</Label>
          <Text style={{ color: c.text, fontSize: 14 }}>{unassigned.map(name).join(', ')}</Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>Tap an empty slot to place them.</Text>
        </View>
      )}

      {matches.map((m, mi) => (
        <View key={mi} style={{ gap: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: c.border }}>
          {matches.length > 1 && <Text style={{ fontFamily: fonts.serif, fontSize: 16, fontWeight: '700', color: c.text }}>Match {mi + 1}</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
            {sideCol(m, mi, 'a')}
            <View style={{ alignSelf: 'center', width: 26, height: 26, borderRadius: 13, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', marginTop: n > 1 ? 18 : 0 }}>
              <Text style={{ color: c.muted, fontSize: 11, fontWeight: '800' }}>vs</Text>
            </View>
            {sideCol(m, mi, 'b')}
          </View>
        </View>
      ))}

      <Sheet
        visible={!!slot}
        onClose={() => setSlot(null)}
        title={slot ? `${matches.length > 1 ? `Match ${slot.match + 1} · ` : ''}${slot.side === 'a' ? 'Team A' : 'Team B'}` : ''}>
        {free.length > 0 && <Label>Not placed yet</Label>}
        {free.map((id) => (
          <Pressable key={id} onPress={() => place(id)} accessibilityRole="button" style={({ pressed }) => ({ paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{name(id)}</Text>
          </Pressable>
        ))}
        {taken.length > 0 && <Label style={{ marginTop: space.md }}>Move from another spot</Label>}
        {taken.map((id) => (
          <Pressable key={id} onPress={() => place(id)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ flex: 1, color: c.text, fontSize: 16 }}>{name(id)}</Text>
            <Text style={{ color: c.muted, fontSize: 13 }}>{whereIs(id)}</Text>
          </Pressable>
        ))}
        {options.length === 0 && <Text style={{ color: c.muted }}>No players can go here.</Text>}
      </Sheet>
    </Card>
  );
}
