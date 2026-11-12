/**
 * Scores → Friends' Matches: what my friends are playing. Live matches, rounds coming up and recent
 * results, filtered to the friends I pick. The ⋯ on a live or upcoming match follows it (a live card on
 * my Home screen) or turns on alerts when it changes.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Sheet } from '@/components/round-setup';
import { Body, Button, Toggle } from '@/components/ui';
import { formatDate, today } from '@/lib/dates';
import { gameTitle } from '@/lib/games';
import { headline } from '@/lib/headline';
import { playersIn } from '@/lib/edit-rights';
import { courseFor, evaluate, isResult, shortCourseName } from '@/lib/round';
import { isMeId } from '@/lib/me';
import { useStore } from '@/store/store';
import { followOf, loadFriendMatches, setFollowMatch, setFollowUpcoming, setNotifyMatch, setNotifyUpcoming, useFollows, type FriendEvent, type FriendRound } from '@/sync/follows';
import { radius, space, useColors } from '@/theme';
import { ListSection } from './list-section';

const firstNames = (s: string) => s.split(' & ').map((n) => n.trim().split(' ')[0]).join(' & ');

type LiveItem = { kind: 'match'; fr: FriendRound; gi: number; key: string; at: number };
type PlanItem = { kind: 'plan'; fe: FriendEvent; planId: string; number: number; date: string; key: string };
type Item = LiveItem | PlanItem;

export function FriendMatches() {
  const c = useColors();
  const { rounds, events, rows, loaded, loading, error } = useFollows();
  const saved = useStore((s) => s.players);
  const [only, setOnly] = useState<string[]>([]);
  const [menu, setMenu] = useState<Item | null>(null);

  useEffect(() => {
    void loadFriendMatches();
    const t = setInterval(() => void loadFriendMatches(), 60_000);
    return () => clearInterval(t);
  }, []);

  // Everyone the filter can pick: friends seen in any of these rounds or events.
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const fr of rounds) for (const p of fr.round.players) m.set(p.id, p.name);
    for (const fe of events) for (const [id, n] of Object.entries(fe.names)) m.set(id, n);
    for (const p of saved) m.set(p.id, p.name);
    return (id: string) => m.get(id) ?? 'Friend';
  }, [rounds, events, saved]);
  const friendIds = useMemo(() => [...new Set([...rounds.flatMap((x) => x.friends), ...events.flatMap((x) => x.friends)])].sort((a, b) => nameOf(a).localeCompare(nameOf(b))), [rounds, events, nameOf]);
  const picked = (ids: string[]) => only.length === 0 || ids.some((id) => only.includes(id));

  // One item per match a (picked) friend plays in.
  const live: LiveItem[] = [];
  const done: LiveItem[] = [];
  const st = useStore.getState();
  const isMine = (id: string) => id === st.me || isMeId(id, st);
  for (const fr of rounds) {
    const r = fr.round;
    // Matches I'm playing in are under My Matches, not here.
    const games = r.games.map((g, gi) => ({ g, gi })).filter(({ g }) => !(g.id ?? '').startsWith('side-') && !playersIn(g).some(isMine));
    const withFriend = games.filter(({ g }) => playersIn(g).some((id) => fr.friends.includes(id) && picked([id])));
    const list = withFriend.length ? withFriend : picked(fr.friends) && !r.players.some((p) => isMine(p.id)) ? games : [];
    for (const { gi } of list) (r.status === 'active' ? live : done).push({ kind: 'match', fr, gi, key: `${r.id}:${gi}`, at: r.createdAt });
  }
  const upcoming: PlanItem[] = [];
  const from = today();
  for (const fe of events) {
    if (!picked(fe.friends)) continue;
    for (const p of fe.event.rounds ?? []) {
      if (p.roundId || !p.date || p.date < from) continue;
      upcoming.push({ kind: 'plan', fe, planId: p.id, number: p.number, date: p.date, key: `${fe.event.id}:${p.id}` });
    }
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  const open = (it: Item) => {
    if (it.kind === 'match') {
      const onPhone = useStore.getState().rounds.some((r) => r.id === it.fr.round.id);
      if (onPhone) return router.push(it.fr.round.status === 'active' ? { pathname: '/round/[id]', params: { id: it.fr.round.id, match: String(it.gi) } } : `/round/${it.fr.round.id}/results`);
      if (it.fr.round.status === 'active') setMenu(it);
    } else if (useStore.getState().events.some((e) => e.id === it.fe.event.id)) router.push(`/event/${it.fe.event.id}`);
    else setMenu(it);
  };

  if (!loaded && loading) return <ActivityIndicator color={c.primary} style={{ marginTop: space.lg }} />;
  if (!loaded && error) return <Body muted>{error}</Body>;
  if (loaded && friendIds.length === 0) {
    return (
      <View style={{ gap: space.sm }}>
        <Body muted>When your friends play rounds on Clutch Up, they show here. Follow a match to put it on your Home screen, or get alerts as it unfolds.</Body>
        <Button small kind="secondary" title="Find friends" onPress={() => router.push('/friends')} />
      </View>
    );
  }

  return (
    <View style={{ gap: space.md }}>
      {/* Which friends to show. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip label="All friends" on={only.length === 0} onPress={() => setOnly([])} />
        {friendIds.map((id) => (
          <Chip key={id} label={nameOf(id).split(' ')[0]} on={only.includes(id)} onPress={() => setOnly(only.includes(id) ? only.filter((x) => x !== id) : [...only, id])} />
        ))}
      </View>
      {error ? <Text style={{ color: c.muted, fontSize: 12 }}>{error}</Text> : null}

      <ListSection title="In progress" count={live.length} empty="None of your friends are playing right now.">
        {live.map((it) => <MatchRow key={it.key} it={it} following={!!followOf(rows, { roundId: it.fr.round.id, gi: it.gi })?.follow} onPress={() => open(it)} onMore={() => setMenu(it)} />)}
      </ListSection>
      <ListSection title="Upcoming" count={upcoming.length} empty="No rounds coming up.">
        {upcoming.map((it) => <PlanRow key={it.key} it={it} nameOf={nameOf} following={!!followOf(rows, { eventId: it.fe.event.id, planId: it.planId })?.follow} onPress={() => open(it)} onMore={() => setMenu(it)} />)}
      </ListSection>
      <ListSection title="Completed" count={done.length} collapsed empty="No finished rounds in the last three weeks.">
        {done.map((it) => <MatchRow key={it.key} it={it} onPress={() => open(it)} />)}
      </ListSection>

      <FollowMenu item={menu} onClose={() => setMenu(null)} />
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: on ? c.primary : c.chip, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: on ? c.onPrimary : c.primary, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function MoreButton({ onPress, label }: { onPress: () => void; label: string }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.chip, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: c.primary, fontSize: 18, fontWeight: '900', marginTop: -6 }}>⋯</Text>
    </Pressable>
  );
}

function MatchRow({ it, following, onPress, onMore }: { it: LiveItem; following?: boolean; onPress: () => void; onMore?: () => void }) {
  const c = useColors();
  const r = it.fr.round;
  const res = evaluate(r)[it.gi];
  const h = res && isResult(res) ? headline(res, r.players) : null;
  let course = '';
  try { course = shortCourseName(courseFor(r).name); } catch { /* course missing */ }
  const status = h ? (h.board?.[0] ? `${firstNames(h.board[0].name)} ${h.board[0].value}` : h.leader ? `${firstNames(h.leader)} ${h.big}` : h.big) : '';
  const live = r.status === 'active';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: following ? c.accent : c.border, padding: space.md }}>
      <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, gap: 2, opacity: pressed ? 0.6 : 1 })} accessibilityRole="button" accessibilityLabel={`${gameTitle(r.games[it.gi], r.players)}: ${status}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: c.text, fontWeight: '800', fontSize: 15 }}>{gameTitle(r.games[it.gi], r.players)}</Text>
          {live && <View style={{ backgroundColor: c.under, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}><Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>LIVE</Text></View>}
          {following && <Text style={{ color: c.accent, fontSize: 11, fontWeight: '800' }}>★ FOLLOWING</Text>}
        </View>
        <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{[course, new Date(r.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })].filter(Boolean).join(' · ')}</Text>
        {status ? <Text numberOfLines={1} style={{ color: c.primary, fontWeight: '700', fontSize: 14 }}>{status}{h && live ? `  ·  ${h.small.toLowerCase()}` : ''}</Text> : null}
      </Pressable>
      {onMore && <MoreButton onPress={onMore} label="Follow and notification options" />}
    </View>
  );
}

function PlanRow({ it, nameOf, following, onPress, onMore }: { it: PlanItem; nameOf: (id: string) => string; following: boolean; onPress: () => void; onMore: () => void }) {
  const c = useColors();
  const who = it.fe.friends.map((id) => nameOf(id).split(' ')[0]).join(', ');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: following ? c.accent : c.border, padding: space.md }}>
      <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, gap: 2, opacity: pressed ? 0.6 : 1 })} accessibilityRole="button">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: c.text, fontWeight: '800', fontSize: 15 }}>{it.fe.event.name} · Round {it.number}</Text>
          {following && <Text style={{ color: c.accent, fontSize: 11, fontWeight: '800' }}>★ FOLLOWING</Text>}
        </View>
        <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{formatDate(it.date)}{who ? ` · ${who}` : ''}</Text>
      </Pressable>
      <MoreButton onPress={onMore} label="Follow and notification options" />
    </View>
  );
}

/** The ⋯ options: follow (a card on Home) and alerts. */
function FollowMenu({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const c = useColors();
  const rows = useFollows((s) => s.rows);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!item) return null;
  const isMatch = item.kind === 'match';
  const row = isMatch ? followOf(rows, { roundId: item.fr.round.id, gi: item.gi }) : followOf(rows, { eventId: item.fe.event.id, planId: item.planId });
  const title = isMatch ? gameTitle(item.fr.round.games[item.gi], item.fr.round.players) : `${item.fe.event.name} · Round ${item.number}`;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); await loadFriendMatches(); } finally { setBusy(false); }
  };
  return (
    <Sheet visible onClose={onClose} title={title}>
      <View style={{ gap: space.sm }}>
        <Toggle
          label={isMatch ? 'Follow match' : 'Follow round'}
          hint={isMatch ? 'Puts this match on your Home screen as a live card.' : 'Puts this event on your phone; the round shows on your Home screen when it starts.'}
          value={!!row?.follow}
          onChange={(v) => void run(() => (isMatch ? setFollowMatch(item.fr.round.id, item.gi, v) : setFollowUpcoming(item.fe.event.id, item.planId, v)))}
        />
        <Toggle
          label="Notifications"
          hint={isMatch ? 'An alert when someone goes ahead, it’s squared, or the match finishes.' : 'An alert when the round starts.'}
          value={!!row?.notify}
          onChange={(v) => void run(() => (isMatch ? setNotifyMatch(item.fr.round.id, item.gi, v) : setNotifyUpcoming(item.fe.event.id, item.planId, v)))}
        />
        {busy && <ActivityIndicator color={c.primary} />}
        {err && <Text style={{ color: c.danger }}>{err}</Text>}
        {isMatch && row?.follow && (
          <Button small kind="secondary" title="Open live scoring" onPress={() => { onClose(); router.push({ pathname: '/round/[id]', params: { id: item.fr.round.id, match: String(item.gi) } }); }} />
        )}
      </View>
    </Sheet>
  );
}
