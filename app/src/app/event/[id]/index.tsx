import { Countdown } from '@/components/countdown';
import { NextRound } from '@/components/next-round';
import { eventCountdown } from '@/lib/event-calendar';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { EventRounds } from '@/components/event-rounds';
import { ScheduleSection } from '@/components/schedule';
import { useAutoIdentity } from '@/components/people';
import { ShareCard } from '@/components/share-card';
import { TvButton } from '@/components/tv-button';
import { Body, Button, Card, H2, Label, styles } from '@/components/ui';
import { shareEvent } from '@/sync/sync';
import { describeRecurrence, formatDate } from '@/lib/dates';
import { canDeleteEvent, cupScore, eventMatches, eventStandings, eventTeamTotals, formatPoints, type EventMatch } from '@/lib/events';
import { headline } from '@/lib/headline';
import { liveTeamScore } from '@/lib/results';
import { evaluate, isResult } from '@/lib/round';
import { formatIndex } from '@/lib/format';
import { useEvent, useStore, type EventRecord, type RoundRecord } from '@/store/store';
import { fonts, radius, space, teamColor, useColors } from '@/theme';
import { namesFor, teamName } from '@/lib/team-colors';
import { Tip } from '@/components/tip';
import { AddEventPlayer } from '@/components/add-event-player';
import { EventStory } from '@/components/event-story';
import { TripExpenses } from '@/components/trip-expenses';
import { FedexStandings } from '@/components/fedex-standings';

export { ErrorBoundary } from '@/components/error-screen';

/** When a finished match was decided: the latest score entered for any of its players (else when its round started). */
function finishedAt(m: EventMatch, r: RoundRecord | undefined): number {
  if (!r) return 0;
  const who = new Set([...m.sideA, ...m.sideB]);
  let t = 0;
  for (const [slot, entry] of Object.entries(r.ledger)) if (who.has(slot.split('#')[0])) t = Math.max(t, entry.enteredAt || 0);
  return t || r.createdAt;
}

/** The short result for the coloured block: "3&2", "1 UP", "AS", or a Nassau's points. */
function resultText(m: EventMatch, r: RoundRecord | undefined): string {
  if (m.result === 'halved') return 'AS';
  if (m.points) return `${formatPoints(m.points.A)}–${formatPoints(m.points.B)}`;
  if (!r) return 'WIN';
  const gi = Number(m.id.slice(m.id.lastIndexOf('-') + 1));
  const res = evaluate(r)[gi];
  const big = res && isResult(res) ? headline(res, r.players).big : '';
  return big.match(/Win (.+)$/)?.[1] ?? (/UP/.test(big) ? big : 'WIN');
}

/** Finished matches, newest first: the winner stands out, and the result sits on the right in the winning team's colour. */
function MatchResults({ e, matches, rounds, name }: { e: EventRecord; matches: EventMatch[]; rounds: RoundRecord[]; name: (id: string) => string }) {
  const c = useColors();
  const [all, setAll] = useState(false);
  const roundOf = (id: string) => rounds.find((r) => r.id === id);
  const done = matches.filter((m) => m.result !== null).map((m) => ({ m, r: roundOf(m.roundId) })).sort((x, y) => finishedAt(y.m, y.r) - finishedAt(x.m, x.r));
  const shown = all ? done : done.slice(0, 5);
  // Each side's colour: the cup's teams, else the player's team in the event, else the app's green.
  const sideColor = (ids: string[], side: 'A' | 'B') => {
    if (e.teams) return teamColor(side, e.teamColors).color;
    const L = e.teamOf?.[ids[0]];
    return L ? teamColor(L, e.teamColors).color : c.primary;
  };
  return (
    <Card>
      <H2>Match results</H2>
      {done.length === 0 ? <Body muted>No finished matches yet.</Body> : null}
      <View style={{ gap: 8 }}>
        {shown.map(({ m, r }) => {
          const winColor = m.result === 'A' ? sideColor(m.sideA, 'A') : m.result === 'B' ? sideColor(m.sideB, 'B') : '#14261E';
          const winnerTeam = e.teams && (m.result === 'A' || m.result === 'B') ? e.teams[m.result].name : null;
          const line = (ids: string[], side: 'A' | 'B') => {
            const won = m.result === side;
            const lost = m.result !== 'halved' && !won;
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sideColor(ids, side), opacity: lost ? 0.45 : 1 }} />
                <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, fontWeight: won ? '800' : '400', color: lost ? c.muted : sideColor(ids, side) }}>{ids.map(name).join(' & ')}</Text>
                {won ? <Text style={{ color: sideColor(ids, side), fontSize: 14, fontWeight: '800' }}>✓</Text> : null}
              </View>
            );
          };
          return (
            <Pressable key={m.id} onPress={() => router.push(`/round/${m.roundId}/results`)} accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'stretch', borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: pressed ? c.bg : c.card, overflow: 'hidden' })}>
              <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, gap: 3 }}>
                <Text numberOfLines={1} style={{ color: c.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>{[m.name, r?.label].filter(Boolean).join(' · ').toUpperCase()}</Text>
                {line(m.sideA, 'A')}
                {line(m.sideB, 'B')}
              </View>
              <View style={{ width: 84, backgroundColor: winColor, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                <Text style={{ color: '#fff', fontFamily: fonts.serif, fontWeight: '700', fontSize: 21 }}>{resultText(m, r)}</Text>
                <Text numberOfLines={1} style={{ color: '#ffffffd0', fontWeight: '700', fontSize: 9, letterSpacing: 1 }}>{m.result === 'halved' ? 'HALVED' : (winnerTeam ?? 'FINAL').toUpperCase()}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {done.length > 5 ? (
        <Button small kind="ghost" title={all ? 'Show fewer ▴' : `Show all ${done.length} match results ▾`} onPress={() => setAll((x) => !x)} />
      ) : null}
    </Card>
  );
}

/** Under the event score: where the teams are heading if the matches in play finish as they stand. */
function ProjectedLine({ items }: { items: { letter: string; value: number; color: string }[] }) {
  const c = useColors();
  const num = (x: (typeof items)[number]) => <Text key={x.letter} style={{ color: x.color, fontFamily: fonts.serif, fontWeight: '700', fontSize: 24, minWidth: 44, textAlign: 'center' }}>{formatPoints(x.value)}</Text>;
  const label = <Text key="label" style={{ color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 2.5 }}>PROJECTED</Text>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingTop: space.sm }}>
      {items.length === 2 ? [num(items[0]), label, num(items[1])] : [label, ...items.map(num)]}
    </View>
  );
}

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const e = useEvent(id);
  const rounds = useStore((s) => s.rounds);
  const saved = useStore((s) => s.players);
  const deleteEvent = useStore((s) => s.deleteEvent);
  const c = useColors();
  const [tab, setTab] = useState<'event' | 'expenses'>('event');
  useAutoIdentity(e && e.remote && e.remote.role !== 'owner' ? e.playerIds.map((pid) => ({ id: pid, name: saved.find((p) => p.id === pid)?.name ?? '' })) : []);
  if (!e) return <Body>Event not found.</Body>;

  const name = (pid: string) => saved.find((p) => p.id === pid)?.name ?? '?';
  const eventRounds = rounds.filter((r) => r.eventId === e.id);
  const matches = eventMatches(e, rounds);
  const live = eventRounds.filter((r) => r.status === 'active');
  // Anyone who can edit the event can add a player while it's under way.
  const canAdd = e.remote?.role !== 'viewer' && e.status !== 'complete';
  const expensesOn = e.type === 'trip' && !!e.expenses?.on;

  // Each player's record, with their team (Ryder Cup: its team names and colours; other events: Team A, B…).
  const teamTag = (pid: string): { label: string; color: string } | null => {
    if (e.teams) {
      if (e.teams.A.playerIds.includes(pid)) return { label: e.teams.A.name.toUpperCase(), color: teamColor('A', e?.teamColors).color };
      if (e.teams.B.playerIds.includes(pid)) return { label: e.teams.B.name.toUpperCase(), color: teamColor('B', e?.teamColors).color };
      return null;
    }
    const L = e.teamOf?.[pid];
    return L ? { label: teamName(L, namesFor(undefined, e)).toUpperCase(), color: teamColor(L, e?.teamColors).color } : null;
  };
  const standingsCard = (
      <Card>
        <H2>Standings</H2>
        <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 4 }]}>
          <Label style={{ flex: 1 }}>Player</Label>
          <Label style={{ width: 70, textAlign: 'center' }}>W-L-H</Label>
          <Label style={{ width: 44, textAlign: 'right' }}>Pts</Label>
        </View>
        {eventStandings(e, rounds).map((row) => (
          <View key={row.playerId} style={[styles.row, { paddingVertical: 4 }]}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Body style={{ flexShrink: 1 }}>{row.position}. {name(row.playerId)}</Body>
              {teamTag(row.playerId) ? (
                <View style={{ backgroundColor: teamTag(row.playerId)!.color, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, flexShrink: 1 }}>
                  <Text numberOfLines={1} style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>{teamTag(row.playerId)!.label}</Text>
                </View>
              ) : null}
            </View>
            <Body muted style={{ width: 70, textAlign: 'center' }}>{row.wins}-{row.losses}-{row.halves}</Body>
            <Text style={{ width: 44, textAlign: 'right', fontFamily: fonts.serif, fontWeight: '700', fontSize: 17, color: c.text }}>{formatPoints(row.points)}</Text>
          </View>
        ))}
        <Label style={{ textTransform: 'none', letterSpacing: 0 }}>Win 1 · halve ½ · Nassau matches count their points · every match counts, including side matches.</Label>
      </Card>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: e.name,
          // Owners and scorekeepers can change the name and dates at any time.
          headerRight: e.remote?.role === 'viewer' ? undefined : () => (
            <Pressable onPress={() => router.push({ pathname: '/event/[id]/edit', params: { id: e.id } })} hitSlop={10} accessibilityRole="button" accessibilityLabel="Edit event details">
              <Text style={{ color: c.primary, fontSize: 16, fontWeight: '700' }}>Edit</Text>
            </Pressable>
          ),
        }}
      />
      {/* Trips tracking expenses: Event | Trip Expenses tabs. Everything else on the page is unchanged. */}
      {expensesOn ? (
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.bg }}>
          {([['event', 'Event'], ['expenses', 'Trip Expenses']] as const).map(([k, label]) => (
            <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}
              style={{ flex: 1, alignItems: 'center', paddingTop: 12, paddingBottom: 9, borderBottomWidth: 3, borderBottomColor: tab === k ? c.primary : 'transparent' }}>
              <Text style={{ fontFamily: fonts.serif, fontWeight: '700', fontSize: 16, color: tab === k ? c.primary : c.muted }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {expensesOn && tab === 'expenses' ? <TripExpenses e={e} /> : (
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}>
        {(e.startDate || e.recurrence) && (
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text style={{ color: c.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>{e.type === 'cup' ? 'RYDER CUP' : e.type === 'season' ? (e.fedex ? 'SEASON · POINTS RACE' : 'SEASON') : 'TRIP'}</Text>
            {e.startDate && (
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>
                {formatDate(e.startDate, { month: 'short', day: 'numeric' })}
                {e.endDate && e.endDate !== e.startDate ? ` – ${formatDate(e.endDate, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
              </Text>
            )}
            {e.recurrence && <Text style={{ color: c.muted, fontSize: 13 }}>{describeRecurrence(e.recurrence)}</Text>}
          </View>
        )}
        {/* Something to look forward to: the countdown to the start, or to the next round. */}
        {(() => {
          const cd = eventCountdown(e, rounds);
          return cd && cd.kind === 'event' ? <Countdown target={cd} /> : null;
        })()}
        {e.teams ? (
          (() => {
            const { matches: cupMatches, standings: s } = cupScore(e, rounds);
            const proj = s.projected;
            const status =
              s.winner === 'A' || s.winner === 'B'
                ? `${e.teams![s.winner].name} win the cup`
                : s.retainedBy
                  ? `${e.teams![s.retainedBy].name} retain the cup`
                  : s.winner === 'tied'
                    ? 'The cup is tied'
                    : s.totalPoints === 0
                      ? 'No matches yet'
                      : `${formatPoints(s.toWin)} points to win${e.holder ? ` · ${formatPoints(s.toRetain!)} for ${e.teams![e.holder].name} to retain` : ''}`;
            return (
              <>
                <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
                  <View style={{ height: 3, backgroundColor: c.accent }} />
                  <View style={{ flexDirection: 'row' }}>
                    {(['A', 'B'] as const).map((t) => (
                      <View key={t} style={{ flex: 1, alignItems: 'center', paddingVertical: space.lg, backgroundColor: t === 'A' ? teamColor('A', e?.teamColors).color : teamColor('B', e?.teamColors).color }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 }}>{e.teams![t].name.toUpperCase()}</Text>
                        <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 48, fontWeight: '700' }}>{formatPoints(t === 'A' ? s.teamA : s.teamB)}</Text>
                      </View>
                    ))}
                  </View>
                  {proj && live.length ? <ProjectedLine items={[{ letter: 'A', value: proj.teamA, color: teamColor('A', e?.teamColors).color }, { letter: 'B', value: proj.teamB, color: teamColor('B', e?.teamColors).color }]} /> : null}
                  <Text style={{ textAlign: 'center', padding: space.sm, color: c.text, fontWeight: '600' }}>{status}</Text>
                </View>

                <NextRound e={e} />
                <EventStory e={e} rounds={rounds} />
                {e.rounds?.length || eventRounds.length ? <EventRounds e={e} /> : null}
                {(!e.rounds?.length || (e.schedule?.length ?? 0) > 0) && <ScheduleSection e={e} />}

                {standingsCard}

                <Card>
                  <View style={[styles.row, { justifyContent: 'space-between' }]}>
                    {(['A', 'B'] as const).map((t) => (
                      <View key={t} style={{ flex: 1 }}>
                        <Text style={{ color: t === 'A' ? teamColor('A', e?.teamColors).color : teamColor('B', e?.teamColors).color, fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>{e.teams![t].name.toUpperCase()}</Text>
                        {e.teams![t].playerIds.map((pid) => (
                          <Body key={pid}>{name(pid)} <Text style={{ color: c.muted }}>{formatIndex(e.lockHandicaps ? e.lockedIndexes[pid] : (saved.find((p) => p.id === pid)?.handicapIndex ?? 0))}</Text></Body>
                        ))}
                      </View>
                    ))}
                  </View>
                </Card>
                {canAdd && <AddEventPlayer e={e} />}


                {cupMatches.length > 0 && <MatchResults e={e} matches={cupMatches} rounds={rounds} name={name} />}
              </>
            );
          })()
        ) : (
          <>
            {e.teamOf && (e.teamLetters?.length ?? 0) >= 2 && (() => {
              const { totals, roundsCounted } = eventTeamTotals(e, rounds);
              const lead = totals[0] && totals[1] && totals[0].points > totals[1].points ? totals[0].letter : null;
              // Projected: add what each team would pick up if the matches in play finished as they stand.
              const extra: Record<string, number> = {};
              for (const r of live) for (const t of liveTeamScore(r, evaluate(r))?.teams ?? []) extra[t.letter] = (extra[t.letter] ?? 0) + (t.projected - t.points);
              const sorted = [...totals].sort((x, y) => x.letter.localeCompare(y.letter));
              return (
                <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
                  <View style={{ height: 3, backgroundColor: c.accent }} />
                  <View style={{ flexDirection: 'row' }}>
                    {[...totals].sort((x, y) => x.letter.localeCompare(y.letter)).map((t) => (
                      <View key={t.letter} style={{ flex: 1, alignItems: 'center', paddingVertical: space.lg, backgroundColor: teamColor(t.letter, e?.teamColors).color }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 }}>{teamName(t.letter, namesFor(undefined, e)).toUpperCase()}{lead === t.letter ? ' 🏆' : ''}</Text>
                        <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 44, fontWeight: '700' }}>{formatPoints(t.points)}</Text>
                        <Text numberOfLines={2} style={{ color: '#ffffffcc', fontSize: 11, textAlign: 'center', paddingHorizontal: 6 }}>{t.members.map((pid) => name(pid).split(' ')[0]).join(', ')}</Text>
                      </View>
                    ))}
                  </View>
                  {live.length ? <ProjectedLine items={sorted.map((t) => ({ letter: t.letter, value: t.points + (extra[t.letter] ?? 0), color: teamColor(t.letter, e?.teamColors).color }))} /> : null}
                  <Text style={{ textAlign: 'center', padding: space.sm, color: c.text, fontWeight: '600' }}>
                    {roundsCounted === 0 ? 'No rounds played yet' : `${lead ? `${teamName(lead, namesFor(undefined, e))} leads` : 'All square'} after ${roundsCounted} round${roundsCounted === 1 ? '' : 's'}`}
                  </Text>
                </View>
              );
            })()}
            <NextRound e={e} />
            {/* Points Race seasons: the 1st half / 2nd half / season standings come first. */}
            {e.fedex ? <FedexStandings e={e} rounds={rounds} /> : null}
            <EventStory e={e} rounds={rounds} />
            {e.rounds?.length || eventRounds.length ? <EventRounds e={e} /> : null}
            {(!e.rounds?.length || (e.schedule?.length ?? 0) > 0) && <ScheduleSection e={e} />}
            {e.fedex ? null : standingsCard}
            {canAdd && <AddEventPlayer e={e} />}
            {e.fedex ? null : <MatchResults e={e} matches={matches} rounds={rounds} name={name} />}
          </>
        )}

        {e.remote?.role !== 'viewer' && !e.rounds && (
          <Button small kind="ghost" title={e.teams ? 'Start an unscheduled match' : 'Start an unscheduled round'} onPress={() => router.push({ pathname: '/new-round', params: { eventId: e.id } })} />
        )}
        <ShareCard remote={e.remote} what="event" onShare={() => shareEvent(e.id)} />

        <TvButton e={e} />
        <Button title="Head-to-head records" kind="secondary" onPress={() => router.push('/head-to-head')} />
        {canDeleteEvent(e, rounds) && e.remote?.role !== 'viewer' && <Button
          title="Delete event"
          kind="ghost"
          onPress={() =>
            Alert.alert('Delete this event?', 'Its rounds are kept.', [
              { text: 'Cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => { router.dismissTo('/'); deleteEvent(e.id); } },
            ])
          }
        />}
      </ScrollView>
      )}
      <Tip
        id="event"
        title="Your event"
        lines={['Tap any match or round to follow it live or see the result. Standings update automatically.', 'Share the join code so the rest of your group can follow along or keep score.']}
      />
    </>
  );
}
