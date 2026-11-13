import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { SwipeToDelete, useDeleteWithUndo } from '@/components/swipe-to-delete';
import { EventDrill, MyRounds } from '@/components/score-drill';
import { FriendMatches } from '@/components/friend-matches';
import { canDeleteEvent, eventPhase } from '@/lib/events';
import { TabHeader } from '@/components/tab-header';
import { Body, Label, Segmented } from '@/components/ui';
import { isMeId } from '@/lib/me';
import { useStore } from '@/store/store';
import { space } from '@/theme';

/** Events, live and upcoming first, each opening out into its rounds and matches. */
function EventsList({ onDeleteEvent }: { onDeleteEvent: (id: string) => void }) {
  const events = useStore((s) => s.events);
  const rounds = useStore((s) => s.rounds);
  if (events.length === 0) return <Body muted>No events yet. Set up a trip or season from Home.</Body>;
  const last = (id: string, fallback: number) => Math.max(fallback, ...rounds.filter((r) => r.eventId === id).map((r) => r.completedAt ?? r.createdAt));
  const sorted = [...events].sort((a, b) => last(b.id, b.createdAt) - last(a.id, a.createdAt));
  const open = sorted.filter((e) => eventPhase(e, rounds) !== 'completed');
  const done = sorted.filter((e) => eventPhase(e, rounds) === 'completed');
  const item = (e: (typeof events)[number]) =>
    canDeleteEvent(e, rounds) && e.remote?.role !== 'viewer' ? (
      <SwipeToDelete key={e.id} label={`event ${e.name}`} onDelete={() => onDeleteEvent(e.id)}><EventDrill e={e} rounds={rounds} /></SwipeToDelete>
    ) : (
      <EventDrill key={e.id} e={e} rounds={rounds} />
    );
  return (
    <View style={{ gap: space.md }}>
      {open.length > 0 && <Label>Live & upcoming</Label>}
      {open.map(item)}
      {done.length > 0 && <Label>Completed</Label>}
      {done.map(item)}
    </View>
  );
}

export default function Scores() {
  const rounds = useStore((s) => s.rounds);
  const { deleteRound, deleteEvent, bar } = useDeleteWithUndo();
  const events = useStore((s) => s.events);
  const [games, setGames] = useState<'events' | 'solo'>('events');
  const [whose, setWhose] = useState<'mine' | 'friends'>('mine');
  const uid = useStore((s) => s.me);
  // My matches: rounds I'm part of (not friends' rounds I'm only following).
  const myRounds = rounds.filter((r) => r.remote?.role !== 'viewer' || r.players.some((p) => p.id === uid || isMeId(p.id)));
  const myEvents = events.filter((e) => e.remote?.role !== 'viewer' || e.playerIds.some((id) => id === uid || isMeId(id)));

  return (
    <View style={{ flex: 1 }}>
      <TabHeader title="Scores" sub="Live rounds and results" />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }}>
        <>
            {/* Mine or my friends'. */}
            <Segmented compact options={[{ value: 'mine', label: 'My Matches' }, { value: 'friends', label: 'Friends’ Matches' }]} value={whose} onChange={setWhose} />
            {whose === 'friends' ? (
              <FriendMatches />
            ) : (
              <>
                {/* Rounds (live, upcoming, completed) or events (opening out into rounds and matches). */}
                <Segmented
                  compact
                  options={[{ value: 'events', label: `Events${myEvents.length ? ` (${myEvents.length})` : ''}` }, { value: 'solo', label: `Rounds${myRounds.length ? ` (${myRounds.length})` : ''}` }]}
                  value={games}
                  onChange={setGames}
                />
                {games === 'events' ? <EventsList onDeleteEvent={deleteEvent} /> : <MyRounds rounds={myRounds} events={myEvents} onDelete={deleteRound} />}
              </>
            )}
        </>
      </ScrollView>
      {bar}
    </View>
  );
}
