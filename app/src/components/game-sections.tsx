import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { canDeleteEvent, eventPhase } from '@/lib/events';
import { useStore } from '@/store/store';
import { radius, space, useColors } from '@/theme';
import { EventCard, RoundCard } from './cards';
import { canDeleteRound, SwipeToDelete } from './swipe-to-delete';
import type { TipTarget } from './tip';
import { Body, Label } from './ui';

function Tag({ text, tone }: { text: string; tone: 'live' | 'upcoming' | 'final' }) {
  const c = useColors();
  const bg = tone === 'live' ? c.under : tone === 'upcoming' ? c.accent : c.primary;
  return (
    <View style={{ position: 'absolute', bottom: space.md, right: space.md, backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, zIndex: 1 }}>
      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>{text}</Text>
    </View>
  );
}

/**
 * Rounds and events split into "Live & upcoming" (swipe to delete when allowed) and "Completed" (kept for history).
 */
export function GameSections({
  skipRoundIds,
  completedLimit,
  hideEventRounds,
  onDeleteRound,
  onDeleteEvent,
  firstOpenRef,
  roundsOnly,
  hideIds,
}: {
  /** Rounds and events to leave out (Home: friends' ones I haven't followed, or the My games / Friends switch). */
  hideIds?: string[];
  /** Only rounds that aren't part of an event (Scores → Rounds). */
  roundsOnly?: boolean;
  /** A round already shown elsewhere on the screen (Home's live card). */
  skipRoundIds?: string[];
  completedLimit?: number;
  /** Show rounds that belong to an event only inside that event (Home). */
  hideEventRounds?: boolean;
  onDeleteRound: (id: string) => void;
  onDeleteEvent: (id: string) => void;
  /** Attached to the first live/upcoming card (Home's tip points at it). */
  firstOpenRef?: TipTarget;
}) {
  const c = useColors();
  const allRounds = useStore((s) => s.rounds);
  const allEvents = useStore((s) => s.events);
  const hidden = new Set(hideIds ?? []);
  const rounds = hidden.size ? allRounds.filter((r) => !hidden.has(r.id)) : allRounds;
  const events = hidden.size ? allEvents.filter((e) => !hidden.has(e.id)) : allEvents;

  const phaseOf = Object.fromEntries(events.map((e) => [e.id, eventPhase(e, rounds)]));
  const openEvents = roundsOnly ? [] : events.filter((e) => phaseOf[e.id] !== 'completed');
  const doneEvents = roundsOnly ? [] : events.filter((e) => phaseOf[e.id] === 'completed');
  const standalone = (r: (typeof rounds)[number]) =>
    roundsOnly ? !r.eventId || !events.some((e) => e.id === r.eventId) : !hideEventRounds || !r.eventId || !events.some((e) => e.id === r.eventId);
  const liveRounds = rounds.filter((r) => r.status === 'active' && !(skipRoundIds ?? []).includes(r.id) && standalone(r));
  const doneRounds = rounds.filter((r) => r.status === 'complete' && standalone(r));
  /** An event sorts by its latest round. */
  const lastActivity = (id: string, fallback: number) =>
    Math.max(fallback, ...rounds.filter((r) => r.eventId === id).map((r) => r.completedAt ?? r.createdAt));

  type Item = { key: string; at: number; node: React.ReactNode };
  const open: Item[] = [
    ...openEvents.map((e) => {
      const card = (
        <View>
          <EventCard e={e} rounds={rounds} />
          <Tag text={phaseOf[e.id] === 'live' ? 'LIVE' : 'UPCOMING'} tone={phaseOf[e.id] === 'live' ? 'live' : 'upcoming'} />
        </View>
      );
      return {
        key: e.id,
        at: lastActivity(e.id, e.createdAt),
        node: canDeleteEvent(e, rounds) && e.remote?.role !== 'viewer' ? (
          <SwipeToDelete key={e.id} label={`event ${e.name}`} onDelete={() => onDeleteEvent(e.id)}>{card}</SwipeToDelete>
        ) : (
          <View key={e.id}>{card}</View>
        ),
      };
    }),
    ...liveRounds.map((r) => {
      const card = (
        <View>
          <RoundCard r={r} />
          <Tag text="LIVE" tone="live" />
        </View>
      );
      return {
        key: r.id,
        at: r.createdAt,
        node: canDeleteRound(r) ? (
          <SwipeToDelete key={r.id} label="round" onDelete={() => onDeleteRound(r.id)}>{card}</SwipeToDelete>
        ) : (
          <View key={r.id}>{card}</View>
        ),
      };
    }),
  ].sort((a, b) => b.at - a.at);

  const done: Item[] = [
    ...doneEvents.map((e) => ({ key: e.id, at: lastActivity(e.id, e.createdAt), node: <View key={e.id}><EventCard e={e} rounds={rounds} /><Tag text="FINAL" tone="final" /></View> })),
    ...doneRounds.map((r) => ({ key: r.id, at: r.completedAt ?? r.createdAt, node: <View key={r.id}><RoundCard r={r} /><Tag text="FINAL" tone="final" /></View> })),
  ].sort((a, b) => b.at - a.at);
  const shownDone = completedLimit ? done.slice(0, completedLimit) : done;

  if (open.length === 0 && done.length === 0) return null;

  return (
    <>
      {open.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Label>Live & upcoming</Label>
          {open.map((i, n) => (n === 0 && firstOpenRef ? <View key={i.key} ref={firstOpenRef} collapsable={false}>{i.node}</View> : i.node))}
          <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>Swipe a live or upcoming card left to delete it.</Text>
        </View>
      )}
      {done.length > 0 && (
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Label>Completed</Label>
            {completedLimit && done.length > completedLimit ? (
              <Pressable onPress={() => router.push('/scores')}><Label style={{ color: c.primary }}>See all {done.length} ›</Label></Pressable>
            ) : null}
          </View>
          {shownDone.map((i) => i.node)}
        </View>
      )}
      {open.length === 0 && done.length > 0 && <Body muted>Nothing live or upcoming. Start a round or set up an event.</Body>}
    </>
  );
}
