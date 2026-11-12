/**
 * Where the team match stands in this round (and, in an event, the overall score), for the full scorecard.
 */
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { formatPoints } from '@/lib/events';
import { teamStatus } from '@/lib/event-status';
import { evaluate } from '@/lib/round';
import { useStore, type EventRecord, type RoundRecord } from '@/store/store';
import { fetchRoundEvent } from '@/sync/sync';
import { fonts, radius, space, useColors } from '@/theme';

/** pinned: compact, edge to edge, for the top of the screen. mini: one slim row (while entering scores). */
type Props = { r: RoundRecord; results: ReturnType<typeof evaluate>; pinned?: boolean; mini?: boolean };

/** In an event (on this phone), tapping the team score opens the event page. */
export function TeamScoreboard(props: Props) {
  const eventId = useStore((s) => (s.events.some((e) => e.id === props.r.eventId) ? props.r.eventId : undefined));
  if (!eventId) return <Board {...props} />;
  return (
    <Pressable onPress={() => router.push(`/event/${eventId}`)} accessibilityRole="button" accessibilityLabel="Team score. Open the event page" accessibilityHint="Shows the event's standings and rounds">
      {({ pressed }) => <View style={{ opacity: pressed ? 0.75 : 1 }}><Board {...props} linked /></View>}
    </Pressable>
  );
}

function Board({ r, results, pinned, mini, linked }: Props & { linked?: boolean }) {
  const c = useColors();
  const localEvent = useStore((s) => s.events.find((e) => e.id === r.eventId));
  const localRounds = useStore((s) => s.rounds);
  // Following just this round: fetch a read-only copy of the event (refreshed every minute).
  const [remote, setRemote] = useState<{ event: EventRecord; rounds: RoundRecord[] } | null>(null);
  const needRemote = !localEvent && !!r.eventId && !!r.remote;
  useEffect(() => {
    if (!needRemote) return;
    let alive = true;
    const load = () => void fetchRoundEvent(r.id).then((x) => alive && setRemote(x)).catch(() => undefined);
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [needRemote, r.id]);
  const event = localEvent ?? remote?.event;
  // This round from the phone (it's the most up to date), the event's other rounds from the server.
  const rounds = localEvent ? localRounds : remote ? [...remote.rounds.filter((x) => x.id !== r.id), r] : localRounds;
  const status = teamStatus(r, results, event, rounds);
  if (!status) return null;
  const first = (id: string) => (r.players.find((p) => p.id === id)?.name ?? '').split(' ')[0];
  const [A, B] = status.teams;
  const inEvent = status.scope === 'event';
  const changes = status.live > 0;
  const done = A.roundPoints + B.roundPoints > 0;
  // The boxes: the event's points (or the round's), projected from the matches in play.
  const teams = status.teams;
  const showProj = changes || A.projected !== A.points || B.projected !== B.points;

  // This round, in words: "This round: Team A 1 – Team B 0 · Team B ahead in 1, 1 all square"
  const parts = teams.filter((t) => t.leading > 0).map((t) => `${t.name} ahead in ${t.leading}`);
  if (status.square) parts.push(`${status.square} all square`);
  const roundScore = `${A.name} ${formatPoints(A.roundPoints)} – ${formatPoints(B.roundPoints)} ${B.name}`;
  const roundLine = inEvent
    ? `This round: ${roundScore}${changes ? ` · ${parts.join(', ')}` : done ? ' · finished' : ' · not started'}`
    : changes ? `Live: ${parts.join(', ')}` : done ? 'All team matches finished' : 'No team matches started yet';
  const eventLine = inEvent ? `${event!.name}${status.toWin ? ` · ${formatPoints(status.toWin)} to win` : ''}` : null;

  if (mini) {
    return (
      <View style={{ backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: space.sm, paddingVertical: 6 }}>
          {teams.map((t) => (
            <View key={t.letter} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6, borderRadius: radius.md, backgroundColor: t.color }}>
              <Text numberOfLines={1} style={{ color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.5, flexShrink: 1 }}>{t.name.toUpperCase()}</Text>
              <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 20, fontWeight: '700' }}>{formatPoints(t.points)}</Text>
              {showProj && <Text style={{ color: '#ffffffd0', fontSize: 11 }}>proj {formatPoints(t.projected)}</Text>}
            </View>
          ))}
        </View>
        <Text numberOfLines={1} style={{ textAlign: 'center', color: c.muted, fontSize: 11, paddingBottom: 5, paddingHorizontal: space.sm }}>
          {inEvent ? `🏆 ${eventLine} · ${roundLine}` : roundLine}{linked ? '  ›' : ''}
        </Text>
      </View>
    );
  }

  return (
    <View style={pinned ? { backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border } : { backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
      <Text numberOfLines={1} style={{ textAlign: 'center', color: c.muted, fontSize: pinned ? 10 : 11, fontWeight: '800', letterSpacing: 1.5, paddingTop: pinned ? 6 : space.sm, paddingHorizontal: space.md }}>
        {inEvent ? `🏆 ${eventLine!.toUpperCase()} · EVENT${linked ? '  ›' : ''}` : 'TEAM MATCH · THIS ROUND'}
      </Text>
      <View style={{ flexDirection: 'row', paddingHorizontal: space.sm, paddingVertical: pinned ? 6 : space.sm, gap: space.sm }}>
        {teams.map((t) => {
          return (
            <View key={t.letter} style={{ flex: 1, alignItems: 'center', paddingVertical: pinned ? 5 : space.sm, borderRadius: radius.md, backgroundColor: t.color }}>
              <Text numberOfLines={1} style={{ color: '#fff', fontSize: pinned ? 11 : 12, fontWeight: '800', letterSpacing: 1 }}>{t.name.toUpperCase()}</Text>
              <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: pinned ? 26 : 34, fontWeight: '700', lineHeight: pinned ? 30 : undefined }}>{formatPoints(t.points)}</Text>
              {showProj && <Text style={{ color: '#ffffffd0', fontSize: pinned ? 11 : 12 }}>Projected {formatPoints(t.projected)}</Text>}
              <Text numberOfLines={pinned ? 1 : 2} style={{ color: '#ffffffc0', fontSize: pinned ? 10 : 11, textAlign: 'center', paddingHorizontal: 4, marginTop: 2 }}>{t.members.map(first).join(', ')}</Text>
            </View>
          );
        })}
      </View>
      <Text style={{ textAlign: 'center', color: c.text, fontSize: pinned ? 12 : 13, paddingHorizontal: space.md, paddingBottom: pinned ? 6 : space.sm }}>
        {roundLine}
      </Text>
    </View>
  );
}
