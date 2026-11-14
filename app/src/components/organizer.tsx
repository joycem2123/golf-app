/**
 * Who organises a round or event ("Organized by Matt"), and for the organiser, Hand off: give the role to someone
 * else in it who's on Clutch Up. A round in an event is run by the event's organiser (hand that off on the event).
 */
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Select } from '@/components/select';
import { isEventOrganizer, isRoundOrganizer, useStore, type EventRecord, type RoundRecord } from '@/store/store';
import { supabase } from '@/sync/supabase';
import { space, useColors } from '@/theme';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function useAccountName() {
  const players = useStore((s) => s.players);
  const names = useStore((s) => s.names);
  const me = useStore((s) => s.me);
  return (uid?: string) => (!uid ? undefined : uid === me ? 'you' : players.find((p) => p.userId === uid || p.id === uid)?.name ?? names[uid] ?? undefined);
}

export function OrganizerLine({ e, r }: { e?: EventRecord; r?: RoundRecord }) {
  const c = useColors();
  const events = useStore((s) => s.events);
  const me = useStore((s) => s.me);
  const players = useStore((s) => s.players);
  const name = useAccountName();
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ev = e ?? (r?.eventId ? events.find((x) => x.id === r.eventId) : undefined);
  const target = ev ?? r;
  if (!target?.remote) return null; // only on this phone: nobody else to organise for
  const mine = ev ? isEventOrganizer(ev, me) : isRoundOrganizer(r!, events, me);
  const ownerId = target.remote.owner;
  const who = mine ? 'you' : name(ownerId);
  const inEventRound = !!r && !!ev;

  // People in it who are on Clutch Up (they can take over).
  const ids = ev ? ev.playerIds : r!.players.map((p) => p.id);
  const accounts = [...new Set(ids.map((id) => players.find((p) => p.id === id)?.userId ?? (UUID.test(id) ? id : undefined)).filter((x): x is string => !!x && x !== me))];
  const canHand = mine && !inEventRound && accounts.length > 0;

  const handOff = async (uid: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('transfer_organizer', { kind: ev ? 'event' : 'round', item: target.id, new_owner: uid });
    setBusy(false);
    setPick(null);
    if (error) return Alert.alert('Couldn’t hand it over', /fetch|network/i.test(error.message) ? 'You’re offline. Try again when you have signal.' : error.message);
    const st = useStore.getState();
    if (ev) st.setEventRemote(ev.id, { ...ev.remote!, role: 'scorer', owner: uid });
    else st.setRoundRemote(r!.id, { ...r!.remote!, role: 'scorer', owner: uid });
  };

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm }}>
        <Text style={{ color: c.muted, fontSize: 13 }}>
          {who ? `Organized by ${who === 'you' ? 'you' : who}` : 'Organizer'}{inEventRound ? ' (runs the event)' : ''}
        </Text>
      </View>
      {canHand ? (
        <View style={{ maxWidth: 320, alignSelf: 'center', width: '100%' }}>
          <Select label="Hand off organizer to" placeholder="Hand off organizer to…" value={null} options={accounts.map((uid) => ({ value: uid, label: name(uid) ?? 'Player' }))} onChange={setPick} />
        </View>
      ) : null}
      <ConfirmDialog
        visible={!!pick}
        title={`Make ${name(pick ?? undefined) ?? 'them'} the organizer?`}
        message="They’ll be the only one who can delete it or hand it on. You stay in it and can still keep score."
        confirmLabel={busy ? 'Handing off…' : 'Hand Off'}
        destructive={false}
        confirmDisabled={busy}
        onCancel={() => setPick(null)}
        onConfirm={() => void handOff(pick!)}
      />
    </View>
  );
}

/** Not the organiser: hide it from my screens instead of deleting it. */
export function HideButton({ id, kind, onDone }: { id: string; kind: 'round' | 'event'; onDone?: () => void }) {
  const c = useColors();
  const hidden = useStore((s) => !!s.hidden?.[id]);
  return (
    <Pressable onPress={() => { useStore.getState().setHidden(id, !hidden); if (!hidden) onDone?.(); }} accessibilityRole="button"
      style={({ pressed }) => ({ alignItems: 'center', paddingVertical: space.md, opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ color: c.muted, fontWeight: '700', fontSize: 15 }}>{hidden ? `Unhide this ${kind}` : `Hide this ${kind}`}</Text>
      {!hidden ? <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>Only the organizer can delete it. Hiding takes it off your Home and Scores.</Text> : null}
    </Pressable>
  );
}
