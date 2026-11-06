import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import type { RecordedMatch } from '@golf/engine';

import { useStore, type EventRecord, type RoundRecord } from '@/store/store';
import { supabase } from '@/sync/supabase';
import { fonts, radius, space, useColors } from '@/theme';
import { courseFor, shortCourseName } from '@/lib/round';
import { gameName } from '@/lib/games';

/** Swipe a card left to reveal a trash can. */
export function SwipeToDelete({ children, onDelete, label }: { children: ReactNode; onDelete: () => void; label: string }) {
  const c = useColors();
  return (
    <Swipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={(_progress, _translation, methods) => (
        <View style={{ justifyContent: 'center', paddingLeft: space.sm }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${label}`}
            onPress={() => {
              methods.close();
              onDelete();
            }}
            style={({ pressed }) => ({
              width: 76, height: '100%', minHeight: 64, borderRadius: radius.lg, backgroundColor: c.danger,
              alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.8 : 1,
            })}>
            {Platform.OS === 'ios' ? <SymbolView name="trash.fill" tintColor="#fff" size={24} /> : <Text style={{ color: '#fff', fontSize: 20 }}>🗑</Text>}
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Delete</Text>
          </Pressable>
        </View>
      )}>
      {children}
    </Swipeable>
  );
}

const UNDO_MS = 5000;

type Pending =
  | { kind: 'round'; round: RoundRecord; matches: RecordedMatch[] }
  | { kind: 'event'; event: EventRecord; roundIds: string[] };

/**
 * Delete rounds/events with a few seconds to undo. Online copies the user owns are removed
 * from the server only once the undo window has passed.
 */
export function useDeleteWithUndo() {
  const c = useColors();
  const [pending, setPending] = useState<Pending | null>(null);
  const [ask, setAsk] = useState<{ kind: 'round' | 'event'; id: string; title: string; detail: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finalize = (p: Pending) => {
    if (p.kind === 'round' && p.round.remote?.role === 'owner') void supabase.from('rounds').delete().eq('id', p.round.id);
    if (p.kind === 'event' && p.event.remote?.role === 'owner') void supabase.from('events').delete().eq('id', p.event.id);
  };

  const start = (p: Pending) => {
    if (timer.current) clearTimeout(timer.current);
    if (pending) finalize(pending); // a second delete confirms the first
    setPending(p);
    timer.current = setTimeout(() => {
      finalize(p);
      setPending(null);
    }, UNDO_MS);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const doDeleteRound = (id: string) => {
    const st = useStore.getState();
    const round = st.rounds.find((r) => r.id === id);
    if (!round) return;
    const matches = st.history.filter((m) => m.eventId === id);
    st.deleteRound(id);
    start({ kind: 'round', round, matches });
  };

  const doDeleteEvent = (id: string) => {
    const st = useStore.getState();
    const event = st.events.find((e) => e.id === id);
    if (!event) return;
    const roundIds = st.rounds.filter((r) => r.eventId === id).map((r) => r.id);
    st.deleteEvent(id);
    start({ kind: 'event', event, roundIds });
  };

  /** Ask "Are you sure?" first. */
  const deleteRound = (id: string) => {
    const r = useStore.getState().rounds.find((x) => x.id === id);
    if (!r) return;
    let where = '';
    try { where = shortCourseName(courseFor(r).name); } catch { /* course missing */ }
    const date = new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    setAsk({ kind: 'round', id, title: gameName(r.games[0]), detail: [where, date, r.players.map((p) => p.name).join(', ')].filter(Boolean).join(' · ') });
  };
  const deleteEvent = (id: string) => {
    const e = useStore.getState().events.find((x) => x.id === id);
    if (!e) return;
    setAsk({ kind: 'event', id, title: e.name, detail: 'Its rounds are kept.' });
  };

  const undo = () => {
    if (!pending) return;
    if (timer.current) clearTimeout(timer.current);
    const st = useStore.getState();
    if (pending.kind === 'round') st.restoreRound(pending.round, pending.matches);
    else st.restoreEvent(pending.event, pending.roundIds);
    setPending(null);
  };

  const dialog = (
    <Modal visible={!!ask} transparent animationType="fade" onRequestClose={() => setAsk(null)}>
      <View style={{ flex: 1, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
        <View accessibilityRole="alert" style={{ width: '100%', maxWidth: 360, backgroundColor: c.card, borderRadius: radius.lg, overflow: 'hidden' }}>
          <View style={{ height: 3, backgroundColor: c.accent }} />
          <View style={{ padding: space.xl, gap: space.sm, alignItems: 'center' }}>
            <Text style={{ fontFamily: fonts.serif, fontSize: 20, fontWeight: '700', color: c.text, textAlign: 'center' }}>
              Are you sure you want to delete?
            </Text>
            {ask && (
              <>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>{ask.title}</Text>
                <Text style={{ color: c.muted, fontSize: 13, textAlign: 'center' }}>{ask.detail}</Text>
              </>
            )}
          </View>
          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.border }}>
            <Pressable accessibilityRole="button" onPress={() => setAsk(null)} style={({ pressed }) => ({ flex: 1, paddingVertical: space.lg, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <View style={{ width: 1, backgroundColor: c.border }} />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (ask?.kind === 'round') doDeleteRound(ask.id);
                if (ask?.kind === 'event') doDeleteEvent(ask.id);
                setAsk(null);
              }}
              style={({ pressed }) => ({ flex: 1, paddingVertical: space.lg, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: c.danger, fontSize: 16, fontWeight: '800' }}>Delete</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  const undoBar = pending ? (
    <View
      style={{
        position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg, backgroundColor: c.text, borderRadius: radius.lg,
        paddingVertical: space.md, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
      }}>
      <Text style={{ color: '#fff', flex: 1, fontSize: 15 }}>{pending.kind === 'round' ? 'Round deleted' : 'Event deleted'}</Text>
      <Pressable onPress={undo} accessibilityRole="button" hitSlop={10}>
        <Text style={{ color: c.accent, fontWeight: '800', fontSize: 15, letterSpacing: 0.5 }}>UNDO</Text>
      </Pressable>
    </View>
  ) : null;

  const bar = (
    <>
      {dialog}
      {undoBar}
    </>
  );

  return { deleteRound, deleteEvent, bar };
}
