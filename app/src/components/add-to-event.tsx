/**
 * Put a round that isn't in an event (finished or still being played) into an event that's under way, or, for a
 * round already in an event, Move round: to another event, or out of events altogether (the organiser only).
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Sheet } from '@/components/round-setup';
import { Body, Button } from '@/components/ui';
import { eventPhase } from '@/lib/events';
import { track } from '@/lib/usage';
import { isRoundOrganizer, useStore, type RoundRecord } from '@/store/store';
import { syncRoundIntoEvent, syncRoundOutOfEvent } from '@/sync/sync';
import { radius, space, useColors } from '@/theme';

const TYPE_LABEL = { trip: 'Trip', cup: 'Ryder Cup', season: 'Season' } as const;

export function AddToEvent({ r }: { r: RoundRecord }) {
  const c = useColors();
  const events = useStore((s) => s.events);
  const rounds = useStore((s) => s.rounds);
  const link = useStore((s) => s.linkRoundToEvent);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const me = useStore((s) => s.me);
  // Move round: where it's going (an event id, or 'out').
  const [moving, setMoving] = useState<string | null>(null);

  // Events still going (live or upcoming) that I can add to.
  const open_ = events.filter((e) => e.id !== r.eventId && e.remote?.role !== 'viewer' && eventPhase(e, rounds) !== 'completed');
  if (r.eventId) {
    if (r.remote?.role === 'viewer' || !isRoundOrganizer(r, events, me)) return null;
    return <MoveRound r={r} targets={open_} moving={moving} setMoving={setMoving} open={open} setOpen={setOpen} done={done} setDone={setDone} />;
  }
  if (r.remote?.role === 'viewer') return done ? <Body style={{ color: c.primary, textAlign: 'center' }}>✓ {done}</Body> : null;
  if (open_.length === 0) return done ? <Body style={{ color: c.primary, textAlign: 'center' }}>✓ {done}</Body> : null;

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

function MoveRound({ r, targets, moving, setMoving, open, setOpen, done, setDone }: {
  r: RoundRecord;
  targets: ReturnType<typeof useStore.getState>['events'];
  moving: string | null;
  setMoving: (v: string | null) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  done: string | null;
  setDone: (v: string | null) => void;
}) {
  const c = useColors();
  const events = useStore((s) => s.events);
  const from = events.find((e) => e.id === r.eventId);
  const to = moving && moving !== 'out' ? events.find((e) => e.id === moving) : undefined;
  const name = r.label ?? 'This round';

  const move = async () => {
    const target = moving;
    setMoving(null);
    setOpen(false);
    if (!target) return;
    const st = useStore.getState();
    st.unlinkRoundFromEvent(r.id);
    if (target === 'out') {
      void syncRoundOutOfEvent(r.id).catch(() => undefined);
      track('round_moved', { to: 'none' });
      setDone(`Taken out of ${from?.name ?? 'the event'}. It’s now a round on its own.`);
      return;
    }
    st.linkRoundToEvent(r.id, target);
    void syncRoundIntoEvent(r.id).catch(() => undefined);
    track('round_moved', { to: 'event' });
    setDone(`Moved to ${events.find((e) => e.id === target)?.name ?? 'the event'}.`);
  };

  if (done) return <Body style={{ color: c.primary, textAlign: 'center' }}>✓ {done}</Body>;
  return (
    <>
      <Button title="Move round" kind="secondary" onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Move round">
        <View style={{ gap: space.sm }}>
          <Body muted>{name} is in {from?.name ?? 'an event'}. Move it to another event, or take it out so it’s a round on its own. Scores and results stay the same.</Body>
          {targets.map((e) => (
            <Pressable key={e.id} onPress={() => setMoving(e.id)} accessibilityRole="button" accessibilityLabel={`Move to ${e.name}`}
              style={({ pressed }) => ({ padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, opacity: pressed ? 0.7 : 1 })}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{e.name}</Text>
              <Text style={{ color: c.muted, fontSize: 13 }}>{TYPE_LABEL[e.type]} · {(e.rounds?.length ?? 0)} round{(e.rounds?.length ?? 0) === 1 ? '' : 's'} so far</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setMoving('out')} accessibilityRole="button" accessibilityLabel="Take out of the event"
            style={({ pressed }) => ({ padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.danger, backgroundColor: c.card, opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ color: c.danger, fontSize: 16, fontWeight: '700' }}>Take out of {from?.name ?? 'the event'}</Text>
            <Text style={{ color: c.muted, fontSize: 13 }}>Not in any event</Text>
          </Pressable>
        </View>
      </Sheet>
      <ConfirmDialog
        visible={!!moving}
        title={moving === 'out' ? `Take ${name} out of ${from?.name ?? 'the event'}?` : `Move ${name} to ${to?.name ?? 'that event'}?`}
        message={moving === 'out'
          ? `Its results stop counting in ${from?.name ?? 'the event'}. The round and its scores are kept.`
          : `Its results stop counting in ${from?.name ?? 'this event'} and count in ${to?.name ?? 'the new event'} instead. Anyone not in ${to?.name ?? 'it'} yet is added.`}
        confirmLabel={moving === 'out' ? 'Take Out' : 'Move'}
        destructive={moving === 'out'}
        onCancel={() => setMoving(null)}
        onConfirm={() => void move()}
      />
    </>
  );
}
