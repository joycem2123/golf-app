/**
 * Scores → Friends' Matches: my friends' rounds and events, laid out like My Matches (Rounds in progress /
 * upcoming / completed, or Events), filtered to the friends I pick.
 *
 * Tapping opens it (live scoring, results, the event page). The ⋯ on a round, a match in it, an upcoming
 * round or an event follows it (it shows on my Home screen) or turns on alerts.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ListSection } from '@/components/list-section';
import { Sheet } from '@/components/round-setup';
import { EventDrill, MoreButton, MyRounds, type DrillActions } from '@/components/score-drill';
import { Body, Button, Checkbox, Segmented, Toggle } from '@/components/ui';
import { formatDate, today } from '@/lib/dates';
import { playersIn } from '@/lib/edit-rights';
import { eventPhase } from '@/lib/events';
import { gameTitle } from '@/lib/games';
import { isMeId } from '@/lib/me';
import { courseFor, shortCourseName } from '@/lib/round';
import { useStore, type RoundRecord } from '@/store/store';
import { followOf, loadFriendMatches, setFollow, setNotify, useFollows, viewEvent, viewRound, type FollowTarget, type FriendEvent, type FriendRound } from '@/sync/follows';
import { radius, space, useColors } from '@/theme';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (s: string) => s.trim().toLowerCase();
/** A player added by name ("Dave") is taken to be the friend with that name ("Dave Gerl"). */
const sameName = (player: string, friend: string) => {
  const p = norm(player);
  const f = norm(friend);
  return !!p && (p === f || (!p.includes(' ') && p === f.split(' ')[0]));
};

type Menu = { target: FollowTarget; title: string; what: 'round' | 'match' | 'event' | 'upcoming'; openPath?: string };

export function FriendMatches() {
  const c = useColors();
  const { rounds, events, rows, loaded, loading, error } = useFollows();
  const saved = useStore((s) => s.players);
  const [only, setOnly] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [view, setView] = useState<'rounds' | 'events'>('rounds');
  const [menu, setMenu] = useState<Menu | null>(null);
  const [busy, setBusy] = useState(false);
  const [openErr, setOpenErr] = useState<string | null>(null);

  useEffect(() => {
    void loadFriendMatches();
    const t = setInterval(() => void loadFriendMatches(), 60_000);
    return () => clearInterval(t);
  }, []);

  // Friends' names (accounts), from my friends list or the rounds and events they're in.
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const fr of rounds) for (const p of fr.round.players) m.set(p.id, p.name);
    for (const fe of events) for (const [id, n] of Object.entries(fe.names)) m.set(id, n);
    for (const p of saved) m.set(p.id, p.name);
    return (id: string) => m.get(id) ?? 'Friend';
  }, [rounds, events, saved]);
  const friendIds = useMemo(
    () => [...new Set([...rounds.flatMap((x) => x.friends), ...events.flatMap((x) => x.friends)])].sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    [rounds, events, nameOf],
  );

  // Which friends are in a round: by account, by the server's player↔account links, or by name.
  const friendsIn = (fr: FriendRound) => {
    const ids = new Set([...fr.friends, ...fr.friendPlayers.map((x) => x.user_id)]);
    for (const p of fr.round.players) {
      if (UUID.test(p.id)) continue;
      for (const f of friendIds) if (sameName(p.name, nameOf(f))) ids.add(f);
    }
    return ids;
  };
  const picked = (ids: Iterable<string>) => only.length === 0 || [...ids].some((id) => only.includes(id));

  const st = useStore.getState();
  const isMine = (id: string) => id === st.me || isMeId(id, st);
  // A round goes here if a picked friend is in it and it isn't wholly mine (those are under My Matches).
  const shownRounds: RoundRecord[] = rounds
    .filter((fr) => picked(friendsIn(fr)))
    .filter((fr) => fr.round.games.some((g) => !(g.id ?? '').startsWith('side-') && !playersIn(g).some(isMine)))
    .map((fr) => fr.round);
  const shownEvents = events.filter((fe) => picked(fe.friends));
  const eventRecords = events.map((fe) => fe.event);

  // Upcoming: friends' planned event rounds.
  const from = today();
  const upcoming = shownEvents
    .flatMap((fe) => (fe.event.rounds ?? []).filter((p) => !p.roundId && p.date && p.date >= from).map((p) => ({ fe, p })))
    .sort((a, b) => (a.p.date ?? '').localeCompare(b.p.date ?? ''));

  /** Open a friend's round or event: bring it onto the phone (as a viewer), then go there. */
  const go = async (path: string) => {
    setOpenErr(null);
    setBusy(true);
    try {
      const round = /^\/round\/([^/?]+)/.exec(path)?.[1];
      const event = /^\/event\/([^/?]+)/.exec(path)?.[1];
      if (round) await viewRound(round);
      if (event) await viewEvent(event);
      router.push(path as never);
    } catch (e) {
      setOpenErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const titleOf = (r: RoundRecord) => {
    let course = '';
    try { course = shortCourseName(courseFor(r).name); } catch { /* course missing */ }
    return r.label ?? (course || 'Round');
  };
  const actions: DrillActions = {
    open: (path) => void go(path),
    roundMore: (r) => setMenu({ target: { roundId: r.id }, title: titleOf(r), what: 'round', openPath: r.status === 'active' ? `/round/${r.id}` : `/round/${r.id}/results` }),
    matchMore: (r, gi) => setMenu({ target: { roundId: r.id, gi }, title: gameTitle(r.games[gi], r.players), what: 'match', openPath: `/round/${r.id}?match=${gi}` }),
    isFollowing: (r, gi) => !!followOf(rows, gi === undefined ? { roundId: r.id } : { roundId: r.id, gi })?.follow,
  };

  if (!loaded && loading) return <ActivityIndicator color={c.primary} style={{ marginTop: space.lg }} />;
  if (!loaded && error) return <Body muted>{error}</Body>;
  if (loaded && friendIds.length === 0) {
    return (
      <View style={{ gap: space.sm }}>
        <Body muted>When your friends play rounds on Clutch Up, they show here. Follow one to put it on your Home screen, or get alerts as it unfolds.</Body>
        <Button small kind="secondary" title="Find friends" onPress={() => router.push('/friends')} />
      </View>
    );
  }

  const filterLabel = only.length === 0 ? 'All friends' : only.length <= 2 ? only.map((id) => nameOf(id).split(' ')[0]).join(', ') : `${only.length} friends`;
  const liveEvents = shownEvents.filter((fe) => eventPhase(fe.event, fe.rounds) !== 'completed');
  const doneEvents = shownEvents.filter((fe) => eventPhase(fe.event, fe.rounds) === 'completed');
  const eventItem = (fe: FriendEvent) => (
    <EventDrill
      key={fe.event.id}
      e={fe.event}
      rounds={fe.rounds}
      nameOf={(id) => fe.names[id]}
      following={!!followOf(rows, { eventId: fe.event.id })?.follow}
      onOpenEvent={() => void go(`/event/${fe.event.id}`)}
      onMore={() => setMenu({ target: { eventId: fe.event.id }, title: fe.event.name, what: 'event', openPath: `/event/${fe.event.id}` })}
      actions={actions}
    />
  );

  return (
    <View style={{ gap: space.md }}>
      {/* Which friends to show: a drop-down with several to pick. */}
      <Pressable onPress={() => setPicking(true)} accessibilityRole="button" accessibilityLabel={`Showing ${filterLabel}. Change`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}>
        <View>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>SHOWING</Text>
          <Text numberOfLines={1} style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{filterLabel}</Text>
        </View>
        <Text style={{ color: c.primary, fontSize: 14 }}>▼</Text>
      </Pressable>

      <Segmented
        compact
        options={[{ value: 'rounds', label: `Rounds${shownRounds.length ? ` (${shownRounds.length})` : ''}` }, { value: 'events', label: `Events${shownEvents.length ? ` (${shownEvents.length})` : ''}` }]}
        value={view}
        onChange={setView}
      />
      {busy && <ActivityIndicator color={c.primary} />}
      {openErr ? <Text style={{ color: c.danger }}>{openErr}</Text> : null}
      {error ? <Text style={{ color: c.muted, fontSize: 12 }}>{error}</Text> : null}

      {view === 'rounds' ? (
        <MyRounds
          rounds={shownRounds}
          events={eventRecords}
          actions={actions}
          emptyLive="None of your friends are playing right now."
          emptyDone="No finished rounds in the last three weeks."
          upcomingSlot={{
            count: upcoming.length,
            items: upcoming.map(({ fe, p }) => (
              <View key={`${fe.event.id}:${p.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: space.md }}>
                <Pressable onPress={() => void go(`/event/${fe.event.id}`)} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, gap: 2, opacity: pressed ? 0.6 : 1 })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text numberOfLines={1} style={{ flexShrink: 1, color: c.text, fontWeight: '800', fontSize: 15 }}>{fe.event.name} · Round {p.number}</Text>
                    {followOf(rows, { eventId: fe.event.id, planId: p.id })?.follow && <Text style={{ color: c.accent, fontSize: 11, fontWeight: '800' }}>★ FOLLOWING</Text>}
                  </View>
                  <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{p.date ? formatDate(p.date) : ''}{fe.friends.length ? ` · ${fe.friends.map((id) => nameOf(id).split(' ')[0]).join(', ')}` : ''}</Text>
                  <Text style={{ color: c.primary, fontWeight: '700', fontSize: 12, marginTop: 2 }}>Event page ›</Text>
                </Pressable>
                <MoreButton onPress={() => setMenu({ target: { eventId: fe.event.id, planId: p.id }, title: `${fe.event.name} · Round ${p.number}`, what: 'upcoming', openPath: `/event/${fe.event.id}` })} label="Follow and notification options" />
              </View>
            )),
          }}
        />
      ) : (
        <View style={{ gap: space.md }}>
          <ListSection title="Live & upcoming" count={liveEvents.length} empty="No events in play.">{liveEvents.map(eventItem)}</ListSection>
          <ListSection title="Completed" count={doneEvents.length} collapsed empty="No finished events.">{doneEvents.map(eventItem)}</ListSection>
        </View>
      )}

      <Sheet visible={picking} onClose={() => setPicking(false)} title="Show friends">
        <Checkbox label="All friends" value={only.length === 0} onChange={() => setOnly([])} />
        {friendIds.map((id) => (
          <Checkbox key={id} label={nameOf(id)} value={only.includes(id)} onChange={(v) => setOnly(v ? [...only, id] : only.filter((x) => x !== id))} />
        ))}
      </Sheet>
      <FollowMenu menu={menu} onClose={() => setMenu(null)} onOpen={(path) => { setMenu(null); void go(path); }} />
    </View>
  );
}

const HINTS: Record<Menu['what'], { follow: string; followHint: string; notifyHint: string; open: string }> = {
  round: { follow: 'Follow round', followHint: 'Puts this round on your Home screen as a live card.', notifyHint: 'An alert when any match in the round changes hands or finishes.', open: 'Open live scoring' },
  match: { follow: 'Follow match', followHint: 'Puts this match on your Home screen as a live card.', notifyHint: 'An alert when someone goes ahead, it’s squared, or the match finishes.', open: 'Open live scoring' },
  event: { follow: 'Follow event', followHint: 'Its rounds show on your Home screen as they’re played.', notifyHint: 'Alerts when a round starts and as matches change hands or finish.', open: 'Open event' },
  upcoming: { follow: 'Follow round', followHint: 'Shows on your Home screen when it starts.', notifyHint: 'An alert when the round starts.', open: 'Open event' },
};

/** The ⋯ options: follow (on Home) and alerts. */
function FollowMenu({ menu, onClose, onOpen }: { menu: Menu | null; onClose: () => void; onOpen: (path: string) => void }) {
  const c = useColors();
  const rows = useFollows((s) => s.rows);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!menu) return null;
  const row = followOf(rows, menu.target);
  const h = HINTS[menu.what];
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); await loadFriendMatches(); } finally { setBusy(false); }
  };
  return (
    <Sheet visible onClose={onClose} title={menu.title}>
      <View style={{ gap: space.sm }}>
        <Toggle label={h.follow} hint={h.followHint} value={!!row?.follow} onChange={(v) => void run(() => setFollow(menu.target, v))} />
        <Toggle label="Notifications" hint={h.notifyHint} value={!!row?.notify} onChange={(v) => void run(() => setNotify(menu.target, v))} />
        {busy && <ActivityIndicator color={c.primary} />}
        {err && <Text style={{ color: c.danger }}>{err}</Text>}
        {menu.openPath && <Button small kind="secondary" title={h.open} onPress={() => onOpen(menu.openPath!)} />}
      </View>
    </Sheet>
  );
}
