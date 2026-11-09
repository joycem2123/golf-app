/**
 * Scores → Games → Events: each event opens out into its rounds, and each round into its matches.
 * Every level can be opened: the event page, the round's results (or live scoring), and a match's details.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { formatPoints } from '@/lib/events';
import { gameName, gameTitle } from '@/lib/games';
import { matchOutcomes, roundTeamScore } from '@/lib/results';
import { courseFor, evaluate, isResult, shortCourseName } from '@/lib/round';
import type { EventRecord, RoundRecord } from '@/store/store';
import { radius, space, teamColor, useColors } from '@/theme';
import { EventCard } from './cards';

function Toggle({ open, label, onPress }: { open: boolean; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={label} hitSlop={8}
      style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: open ? c.primary : c.chip, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: open ? c.onPrimary : c.primary, fontSize: 14, fontWeight: '900' }}>{open ? '▴' : '▾'}</Text>
    </Pressable>
  );
}

/** An event card that opens out into its rounds. */
export function EventDrill({ e, rounds }: { e: EventRecord; rounds: RoundRecord[] }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const mine = rounds.filter((r) => r.eventId === e.id).sort((a, b) => b.createdAt - a.createdAt);
  const planned = (e.rounds ?? []).filter((x) => !x.roundId || !mine.some((r) => r.id === x.roundId)).length;
  return (
    <View style={{ gap: 0 }}>
      <EventCard e={e} rounds={rounds} hint="Event page ›" />
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -6, paddingTop: 12, paddingBottom: 8, paddingHorizontal: space.lg, backgroundColor: pressed ? c.chip : c.primarySoft, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, zIndex: -1 })}>
        <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13 }}>
          {mine.length ? `${mine.length} round${mine.length === 1 ? '' : 's'} played` : 'No rounds played yet'}{planned ? ` · ${planned} to come` : ''}
        </Text>
        <Text style={{ color: c.primary, fontWeight: '800', fontSize: 13 }}>{open ? 'Hide ▴' : 'Show rounds ▾'}</Text>
      </Pressable>
      {open && (
        <View style={{ marginLeft: space.md, paddingLeft: space.md, borderLeftWidth: 2, borderLeftColor: c.accent, gap: space.sm, paddingTop: space.sm }}>
          {mine.map((r) => <RoundDrill key={r.id} r={r} e={e} />)}
          {mine.length === 0 && <Text style={{ color: c.muted, fontSize: 13, paddingVertical: space.sm }}>Rounds show here once they’re started.</Text>}
        </View>
      )}
    </View>
  );
}

/** A round in an event: tap for its results (or live scoring), open it out for its matches. */
function RoundDrill({ r, e }: { r: RoundRecord; e: EventRecord }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const results = evaluate(r);
  const matches = matchOutcomes(r, results).filter((m) => !(r.games[m.gi].id ?? '').startsWith('side-'));
  const score = roundTeamScore(r, results);
  const live = r.status === 'active';
  let course = '';
  try { course = shortCourseName(courseFor(r).name); } catch { /* course missing */ }
  const date = new Date(r.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const goRound = () => router.push(live ? `/round/${r.id}` : `/round/${r.id}/results`);
  return (
    <View style={{ backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md }}>
        <Pressable onPress={goRound} style={({ pressed }) => ({ flex: 1, gap: 2, opacity: pressed ? 0.6 : 1 })} accessibilityRole="button" accessibilityLabel={`${r.label ?? 'Round'} ${live ? 'live scoring' : 'results'}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 15 }}>{r.label ?? 'Unscheduled round'}</Text>
            <View style={{ backgroundColor: live ? c.under : c.primary, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>{live ? 'LIVE' : 'FINAL'}</Text>
            </View>
          </View>
          <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{[date, course, gameName(r.games[0])].filter(Boolean).join(' · ')}</Text>
          {score ? (
            <Text style={{ fontSize: 13, fontWeight: '700' }}>
              {score.map((t, i) => (
                <Text key={t.letter} style={{ color: teamColor(t.letter).color }}>{i ? '  –  ' : ''}{e.teams?.[t.letter as 'A' | 'B']?.name ?? `Team ${t.letter}`} {formatPoints(t.points)}</Text>
              ))}
            </Text>
          ) : null}
          <Text style={{ color: c.primary, fontWeight: '700', fontSize: 12, marginTop: 2 }}>{live ? 'Live scoring ›' : 'Round results ›'}</Text>
        </Pressable>
        {matches.length > 0 && <Toggle open={open} label={open ? 'Hide matches' : 'Show matches'} onPress={() => setOpen(!open)} />}
      </View>
      {open && (
        <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg }}>
          {matches.map((m, i) => {
            const res = results[m.gi];
            const status = m.winner === 'halved' ? 'Halved' : m.winner ? `${(m.winner === 'a' ? m.a : m.b).names.split(' & ').map((n) => n.split(' ')[0]).join(' & ')} ${m.detail}` : res && isResult(res) && res.thru ? m.detail : 'Not started';
            return (
              <Pressable key={m.gi} onPress={() => router.push(`/round/${r.id}/match/${m.gi}`)} accessibilityRole="button" accessibilityLabel={`${m.title} details`}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 10, paddingHorizontal: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: c.border, backgroundColor: pressed ? c.chip : 'transparent' })}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{gameTitle(r.games[m.gi], r.players)}</Text>
                  <Text numberOfLines={1} style={{ color: m.winner ? c.primary : c.muted, fontSize: 13, fontWeight: m.winner ? '700' : '400' }}>{status}</Text>
                </View>
                <Text style={{ color: c.primary, fontWeight: '800', fontSize: 16 }}>›</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
