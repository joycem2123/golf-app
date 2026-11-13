/**
 * A Points Race season brought in from a spreadsheet: link each imported name to one of my Clutch Up friends (or me),
 * so their past rounds and standings follow them. Names left unmatched stay as guests.
 */
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { Select } from '@/components/select';
import { Button, Card } from '@/components/ui';
import { importedGuests } from '@/lib/fedex';
import { useMe } from '@/lib/me';
import { useEvent, useStore } from '@/store/store';
import { space, useColors } from '@/theme';

export { ErrorBoundary } from '@/components/error-screen';

export default function MatchPlayers() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const e = useEvent(id);
  const players = useStore((s) => s.players);
  const updateEvent = useStore((s) => s.updateEvent);
  const removePlayer = useStore((s) => s.removePlayer);
  const { me, friends } = useMe();
  const [map, setMap] = useState<Record<string, string>>({});
  if (!e?.fedex) return null;
  const guests = importedGuests(e, players);
  const name = (pid: string) => players.find((p) => p.id === pid)?.name ?? pid;
  const choices = [...(me ? [{ value: me.id, label: `${me.name} (me)` }] : []), ...friends.filter((f) => !e.playerIds.includes(f.id) || Object.values(map).includes(f.id)).map((f) => ({ value: f.id, label: f.name }))];
  const taken = new Set(Object.values(map));

  const save = () => {
    const pairs = Object.entries(map).filter(([, to]) => to && to !== 'guest');
    if (!pairs.length) return router.back();
    const swap = (pid: string) => map[pid] && map[pid] !== 'guest' ? map[pid] : pid;
    const fresh = useStore.getState().events.find((x) => x.id === e.id) ?? e;
    const fedex = fresh.fedex!;
    updateEvent({
      ...fresh,
      playerIds: [...new Set(fresh.playerIds.map(swap))],
      lockedIndexes: Object.fromEntries(Object.entries(fresh.lockedIndexes).map(([k, v]) => [swap(k), v])),
      fedex: { ...fedex, imported: (fedex.imported ?? []).map((r) => ({ ...r, points: Object.fromEntries(Object.entries(r.points).map(([k, v]) => [swap(k), v])) })) },
    });
    // The spreadsheet's guest entries are no longer needed once they're linked to a friend.
    for (const [from] of pairs) if (!useStore.getState().events.some((x) => x.playerIds.includes(from)) && !useStore.getState().rounds.some((r) => r.players.some((p) => p.id === from))) removePlayer(from);
    Alert.alert('Players matched', `${pairs.length} player${pairs.length === 1 ? '' : 's'} linked. Their past rounds now count for them.`);
    router.back();
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Match Players' }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}>
        <Text style={{ color: c.muted, fontSize: 14, lineHeight: 20 }}>
          These names came from your spreadsheet. Link any of them to a Clutch Up friend so their past rounds and standings follow them. Leave the rest as guests.
        </Text>
        {guests.length === 0 ? <Card><Text style={{ color: c.text }}>Everyone is already matched.</Text></Card> : null}
        <Card style={{ gap: space.sm }}>
          {guests.map((g) => (
            <View key={g} style={{ gap: 6, paddingVertical: 4 }}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>{name(g)}</Text>
              <Select
                label={`Match ${name(g)}`}
                value={map[g] ?? 'guest'}
                options={[{ value: 'guest', label: 'Keep as guest' }, ...choices.filter((o) => !taken.has(o.value) || map[g] === o.value)]}
                onChange={(v) => setMap((m) => ({ ...m, [g]: v }))}
              />
            </View>
          ))}
        </Card>
        <Button title="Save Matches" onPress={save} />
      </ScrollView>
    </>
  );
}
