import type { Player } from '@golf/engine';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { shuffle } from '@/lib/format';
import { buildMatches, teamSizesFor, type GameDraft } from '@/lib/games';
import { radius, space, useColors } from '@/theme';
import { Body, Button, Card, H2, Label, Segmented } from './ui';

/**
 * Who plays whom: team size, Match 1 / Match 2 … and tap-two-players-to-swap.
 * With event teams (Ryder Cup), matches are always one team against the other.
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
  const [picked, setPicked] = useState<string | null>(null);
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const sizes = teamSizesFor(draft.kind, players.length);
  const ids = players.map((p) => p.id);
  const cup = !!teamOf && ids.some((id) => teamOf(id));

  const setSize = (n: number) => onChange({ ...draft, teamSize: n, matches: buildMatches(ids, n, teamOf) });
  const randomize = () => {
    const order = cup ? [...shuffle(ids.filter((id) => teamOf!(id) === 'A')), ...shuffle(ids.filter((id) => teamOf!(id) !== 'A'))] : shuffle(ids);
    onChange({ ...draft, matches: buildMatches(order, draft.teamSize, teamOf) });
    setPicked(null);
  };
  // Tap one player, then another, to swap their places.
  const tap = (id: string) => {
    if (!picked) return setPicked(id);
    if (picked === id) return setPicked(null);
    if (cup && teamOf!(picked) !== teamOf!(id)) {
      setPicked(id);
      return;
    }
    const swap = (x: string) => (x === picked ? id : x === id ? picked : x);
    onChange({ ...draft, matches: draft.matches.map((m) => ({ a: m.a.map(swap), b: m.b.map(swap) })) });
    setPicked(null);
  };

  const sideLabel = (n: number) => (n === 1 ? '1 v 1' : `${n} v ${n}`);
  const chip = (id: string, color: string) => {
    const sel = picked === id;
    return (
      <Pressable
        key={id}
        accessibilityRole="button"
        accessibilityLabel={`Swap ${name(id)}`}
        onPress={() => tap(id)}
        style={({ pressed }) => ({
          paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5,
          borderColor: sel ? c.accent : color, backgroundColor: sel ? c.accent : 'transparent', opacity: pressed ? 0.7 : 1,
        })}>
        <Text style={{ color: sel ? '#fff' : color, fontWeight: '700', fontSize: 14 }}>{name(id)}</Text>
      </Pressable>
    );
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <H2>Matchups</H2>
        <Label>{draft.matches.length} match{draft.matches.length === 1 ? '' : 'es'}</Label>
      </View>
      {sizes.length > 1 && (
        <Segmented
          options={sizes.map((n) => ({ value: String(n), label: `${sideLabel(n)} · ${players.length / (2 * n)} match${players.length / (2 * n) === 1 ? '' : 'es'}` }))}
          value={String(draft.teamSize)}
          onChange={(v) => setSize(Number(v))}
        />
      )}
      <Body muted>{picked ? `Tap another player to swap with ${name(picked)}.` : 'Tap two players to swap them.'}</Body>
      {draft.matches.map((m, i) => (
        <View key={i} style={{ gap: space.xs, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: c.border }}>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>MATCH {i + 1}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{m.a.map((id) => chip(id, c.teamA))}</View>
            <Text style={{ color: c.muted, fontWeight: '700' }}>v</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{m.b.map((id) => chip(id, c.teamB))}</View>
          </View>
        </View>
      ))}
      <Button small kind="secondary" title="Randomize matchups" onPress={randomize} />
    </Card>
  );
}
