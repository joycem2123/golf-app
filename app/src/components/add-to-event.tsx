/**
 * Put a round that isn't in an event (finished or still being played) into an event that's under way.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Sheet } from '@/components/round-setup';
import { Body, Button } from '@/components/ui';
import { eventPhase } from '@/lib/events';
import { track } from '@/lib/usage';
import { useStore, type RoundRecord } from '@/store/store';
import { syncRoundIntoEvent } from '@/sync/sync';
import { radius, space, useColors } from '@/theme';

const TYPE_LABEL = { trip: 'Trip', cup: 'Ryder Cup', season: 'Season' } as const;

export function AddToEvent({ r }: { r: RoundRecord }) {
  const c = useColors();
  const events = useStore((s) => s.events);
  const rounds = useStore((s) => s.rounds);
  const link = useStore((s) => s.linkRoundToEvent);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (r.eventId || r.remote?.role === 'viewer') return done ? <Body style={{ color: c.primary, textAlign: 'center' }}>✓ {done}</Body> : null;
  // Events still going (live or upcoming) that I can add to.
  const open_ = events.filter((e) => e.remote?.role !== 'viewer' && eventPhase(e, rounds) !== 'completed');
  if (open_.length === 0) return null;

  const add = (eventId: string) => {
    const e = events.find((x) => x.id === eventId)!;
    link(r.id, eventId);
    void syncRoundIntoEvent(r.id).catch(() => undefined);
    track('round_added_to_event', { type: e.type, round_status: r.status });
    setDone(`Added to ${e.name}. Its matches now count in the standings.`);
    setOpen(false);
  };

  return (
    <>
      <Button title="Add to an event" kind="secondary" onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Add to an event">
        <View style={{ gap: space.sm }}>
          <Body muted>The round becomes the event’s next round and its matches count toward the standings. Anyone not in the event yet is added.</Body>
          {open_.map((e) => {
            const newPlayers = r.players.filter((p) => !e.playerIds.includes(p.id)).length;
            return (
              <Pressable
                key={e.id}
                onPress={() => add(e.id)}
                accessibilityRole="button"
                accessibilityLabel={`Add to ${e.name}`}
                style={({ pressed }) => ({ padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, opacity: pressed ? 0.7 : 1 })}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{e.name}</Text>
                <Text style={{ color: c.muted, fontSize: 13 }}>
                  {TYPE_LABEL[e.type]} · {(e.rounds?.length ?? 0)} round{(e.rounds?.length ?? 0) === 1 ? '' : 's'} so far
                  {newPlayers ? ` · adds ${newPlayers} player${newPlayers === 1 ? '' : 's'}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}
