import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import type { RecordedMatch } from '@golf/engine';

import { isEventOrganizer, isRoundOrganizer, useStore, type EventRecord, type RoundRecord } from '@/store/store';
import { supabase } from '@/sync/supabase';
import { fonts, radius, space, useColors } from '@/theme';
import { courseFor, holesComplete, playedHoles, shortCourseName } from '@/lib/round';
import { gameName } from '@/lib/games';
import { canDeleteEvent } from '@/lib/events';

/**
 * A round can be deleted while it's in progress. Once it has been finished with all 18 holes scored it's
 * part of everyone's history (even if reopened to fix a score). A round finished early and reopened can still go.
 */
export const canDeleteRound = (r: RoundRecord) => r.status !== 'complete' && (!r.completedAt || holesComplete(r) < playedHoles(r).length);

/** What swiping a round does for me: Delete (organiser, while it can still go), Unhide (hidden), else Hide. */
export function roundSwipe(r: RoundRecord): SwipeMode {
  const st = useStore.getState();
  if (st.hidden?.[r.id]) return 'unhide';
  return canDeleteRound(r) && isRoundOrganizer(r, st.events, st.me) ? 'delete' : 'hide';
}
export function eventSwipe(e: EventRecord): SwipeMode {
  const st = useStore.getState();
  if (st.hidden?.[e.id]) return 'unhide';
  return canDeleteEvent(e, st.rounds) && isEventOrganizer(e, st.me) ? 'delete' : 'hide';
}

/** Swipe a card left to reveal a trash can. */
/**
 * The red Delete button behind a swipeable card. It's invisible until the card is actually swiped, so it can't show
 * through around a card that's taller than its background (e.g. an event opened up to show its rounds).
 */
function DeleteAction({ progress, methods, label, onDelete, mode }: { progress: SharedValue<number>; methods: SwipeableMethods; label: string; onDelete: () => void; mode: SwipeMode }) {
  const c = useColors();
  const word = mode === 'hide' ? 'Hide' : mode === 'unhide' ? 'Unhide' : 'Delete';
  const bg = mode === 'delete' ? c.danger : mode === 'hide' ? '#6E746B' : c.primary;
  const icon = mode === 'delete' ? 'trash.fill' : mode === 'hide' ? 'eye.slash.fill' : 'eye.fill';
  const shown = useAnimatedStyle(() => ({ opacity: progress.value > 0.02 ? Math.min(1, progress.value * 3) : 0 }));
  return (
    <Animated.View style={[{ justifyContent: 'center', paddingLeft: space.sm }, shown]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${word} ${label}`}
        onPress={() => {
          methods.close();
          onDelete();
        }}
        style={({ pressed }) => ({
          width: 76, height: '100%', minHeight: 64, borderRadius: radius.lg, backgroundColor: bg,
          alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.8 : 1,
        })}>
        {Platform.OS === 'ios' ? <SymbolView name={icon} tintColor="#fff" size={24} /> : <Text style={{ color: '#fff', fontSize: 20 }}>{mode === 'delete' ? '🗑' : '👁'}</Text>}
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{word}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** delete: the organiser removes it for everyone. hide: anyone else takes it off their own screens. unhide: put it back. */
export type SwipeMode = 'delete' | 'hide' | 'unhide';

export function SwipeToDelete({ children, onDelete, label, disabled, mode = 'delete' }: { children: ReactNode; onDelete: () => void; label: string; disabled?: boolean; mode?: SwipeMode }) {
  if (disabled) return <>{children}</>;
  return (
    <Swipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={(progress, _translation, methods) => <DeleteAction progress={progress} methods={methods} label={label} onDelete={onDelete} mode={mode} />}>
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

  // The online copy is removed by the sync once the undo window has passed (see flush), even if this screen closes.
  const finalize = (_p: Pending) => undefined;

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

  const [hiddenNote, setHiddenNote] = useState<{ id: string; kind: 'round' | 'event' } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Hide (or unhide) on my own screens only. */
  const toggleHidden = (id: string, kind: 'round' | 'event') => {
    const st = useStore.getState();
    const hiding = !st.hidden?.[id];
    st.setHidden(id, hiding);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setHiddenNote(hiding ? { id, kind } : null);
    if (hiding) hideTimer.current = setTimeout(() => setHiddenNote(null), UNDO_MS);
  };

  /** Ask "Are you sure?" first. Not the organiser (or it's finished): hide it on my phone instead. */
  const deleteRound = (id: string) => {
    const r = useStore.getState().rounds.find((x) => x.id === id);
    if (!r) return;
    if (roundSwipe(r) !== 'delete') return toggleHidden(id, 'round');
    let where = '';
    try { where = shortCourseName(courseFor(r).name); } catch { /* course missing */ }
    const date = new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    setAsk({ kind: 'round', id, title: gameName(r.games[0]), detail: [where, date, r.players.map((p) => p.name).join(', ')].filter(Boolean).join(' · ') + '\n\nIt’s removed for everyone in it. You can restore it from Recently Deleted for 30 days.' });
  };
  const deleteEvent = (id: string) => {
    const e = useStore.getState().events.find((x) => x.id === id);
    if (!e) return;
    if (eventSwipe(e) !== 'delete') return toggleHidden(id, 'event');
    setAsk({ kind: 'event', id, title: e.name, detail: 'Its rounds are kept. It’s removed for everyone in it, and you can restore it from Recently Deleted for 30 days.' });
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

  const hideBar = hiddenNote && !pending ? (
    <View
      style={{
        position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg, backgroundColor: c.text, borderRadius: radius.lg,
        paddingVertical: space.md, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
      }}>
      <Text style={{ color: '#fff', flex: 1, fontSize: 15 }}>{hiddenNote.kind === 'round' ? 'Round hidden' : 'Event hidden'} · Show hidden in Scores</Text>
      <Pressable onPress={() => { useStore.getState().setHidden(hiddenNote.id, false); setHiddenNote(null); }} accessibilityRole="button" hitSlop={10}>
        <Text style={{ color: c.accent, fontWeight: '800', fontSize: 15, letterSpacing: 0.5 }}>UNDO</Text>
      </Pressable>
    </View>
  ) : null;

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
      {hideBar}
    </>
  );

  return { deleteRound, deleteEvent, bar };
}
