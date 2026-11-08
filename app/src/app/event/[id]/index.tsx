import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { EventRounds } from '@/components/event-rounds';
import { ScheduleSection } from '@/components/schedule';
import { useAutoIdentity } from '@/components/people';
import { ShareCard } from '@/components/share-card';
import { Body, Button, Card, H2, Label, styles } from '@/components/ui';
import { shareEvent } from '@/sync/sync';
import { describeRecurrence, formatDate } from '@/lib/dates';
import { canDeleteEvent, cupScore, eventMatches, eventStandings, eventTeamTotals, formatPoints, type EventMatch } from '@/lib/events';
import { formatIndex } from '@/lib/format';
import { courseFor, shortCourseName } from '@/lib/round';
import { useEvent, useStore, type EventRecord } from '@/store/store';
import { fonts, radius, space, teamColor, useColors } from '@/theme';
import { Tip } from '@/components/tip';
import { AddEventPlayer } from '@/components/add-event-player';
import { EventStory } from '@/components/event-story';

function MatchRow({ e, m, name }: { e: EventRecord; m: EventMatch; name: (id: string) => string }) {
  const c = useColors();
  const colorFor = (x: 'A' | 'B' | 'halved' | null) => (e.teams ? (x === 'A' ? c.teamA : x === 'B' ? c.teamB : c.muted) : c.primary);
  const state = m.result ?? m.leader;
  return (
    <Pressable onPress={() => router.push(m.result === null ? `/round/${m.roundId}` : `/round/${m.roundId}/results`)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: c.border, gap: space.sm }}>
        <View style={{ width: 4, alignSelf: 'stretch', backgroundColor: colorFor(state), borderRadius: 2 }} />
        <View style={{ flex: 1 }}>
          <Label style={{ letterSpacing: 1 }}>{m.name}{m.result === null ? (m.thru ? ` · thru ${m.thru}` : ' · not started') : ' · final'}</Label>
          <Text style={{ color: c.text, fontSize: 15 }}>
            <Text style={{ color: e.teams ? c.teamA : c.text, fontWeight: m.result === 'A' ? '800' : '500' }}>{m.sideA.map(name).join(' & ')}</Text>
            <Text style={{ color: c.muted }}>  v  </Text>
            <Text style={{ color: e.teams ? c.teamB : c.text, fontWeight: m.result === 'B' ? '800' : '500' }}>{m.sideB.map(name).join(' & ')}</Text>
          </Text>
          <Text style={{ color: c.muted, fontSize: 13 }}>{m.summary}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const e = useEvent(id);
  const rounds = useStore((s) => s.rounds);
  const saved = useStore((s) => s.players);
  const deleteEvent = useStore((s) => s.deleteEvent);
  const c = useColors();
  useAutoIdentity(e && e.remote && e.remote.role !== 'owner' ? e.playerIds.map((pid) => ({ id: pid, name: saved.find((p) => p.id === pid)?.name ?? '' })) : []);
  if (!e) return <Body>Event not found.</Body>;

  const name = (pid: string) => saved.find((p) => p.id === pid)?.name ?? '?';
  const eventRounds = rounds.filter((r) => r.eventId === e.id);
  const matches = eventMatches(e, rounds);
  // Anyone who can edit the event can add a player while it's under way.
  const canAdd = e.remote?.role !== 'viewer' && e.status !== 'complete';

  return (
    <>
      <Stack.Screen options={{ title: e.name }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}>
        {(e.startDate || e.recurrence) && (
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text style={{ color: c.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>{e.type === 'cup' ? 'RYDER CUP' : e.type === 'season' ? 'SEASON' : 'TRIP'}</Text>
            {e.startDate && (
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>
                {formatDate(e.startDate, { month: 'short', day: 'numeric' })}
                {e.endDate && e.endDate !== e.startDate ? ` – ${formatDate(e.endDate, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
              </Text>
            )}
            {e.recurrence && <Text style={{ color: c.muted, fontSize: 13 }}>{describeRecurrence(e.recurrence)}</Text>}
          </View>
        )}
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
                      <View key={t} style={{ flex: 1, alignItems: 'center', paddingVertical: space.lg, backgroundColor: t === 'A' ? c.teamA : c.teamB }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 }}>{e.teams![t].name.toUpperCase()}</Text>
                        <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 48, fontWeight: '700' }}>{formatPoints(t === 'A' ? s.teamA : s.teamB)}</Text>
                        {proj && (proj.teamA !== s.teamA || proj.teamB !== s.teamB) ? (
                          <Text style={{ color: '#ffffffcc', fontSize: 12 }}>Projected {formatPoints(t === 'A' ? proj.teamA : proj.teamB)}</Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                  <Text style={{ textAlign: 'center', padding: space.sm, color: c.text, fontWeight: '600' }}>{status}</Text>
                </View>

                <EventStory e={e} rounds={rounds} />

                <Card>
                  <View style={[styles.row, { justifyContent: 'space-between' }]}>
                    {(['A', 'B'] as const).map((t) => (
                      <View key={t} style={{ flex: 1 }}>
                        <Text style={{ color: t === 'A' ? c.teamA : c.teamB, fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>{e.teams![t].name.toUpperCase()}</Text>
                        {e.teams![t].playerIds.map((pid) => (
                          <Body key={pid}>{name(pid)} <Text style={{ color: c.muted }}>{formatIndex(e.lockHandicaps ? e.lockedIndexes[pid] : (saved.find((p) => p.id === pid)?.handicapIndex ?? 0))}</Text></Body>
                        ))}
                      </View>
                    ))}
                  </View>
                </Card>
                {canAdd && <AddEventPlayer e={e} />}

                {e.rounds?.length ? <EventRounds e={e} /> : null}
                {(!e.rounds?.length || (e.schedule?.length ?? 0) > 0) && <ScheduleSection e={e} />}

                {cupMatches.length > 0 && (
                  <Card>
                    <H2>Results</H2>
                    {cupMatches.map((m) => <MatchRow key={m.id} e={e} m={m} name={name} />)}
                  </Card>
                )}
              </>
            );
          })()
        ) : (
          <>
            {e.teamOf && (e.teamLetters?.length ?? 0) >= 2 && (() => {
              const { totals, roundsCounted } = eventTeamTotals(e, rounds);
              const lead = totals[0] && totals[1] && totals[0].points > totals[1].points ? totals[0].letter : null;
              return (
                <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
                  <View style={{ height: 3, backgroundColor: c.accent }} />
                  <View style={{ flexDirection: 'row' }}>
                    {[...totals].sort((x, y) => x.letter.localeCompare(y.letter)).map((t) => (
                      <View key={t.letter} style={{ flex: 1, alignItems: 'center', paddingVertical: space.lg, backgroundColor: teamColor(t.letter).color }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 }}>TEAM {t.letter}{lead === t.letter ? ' 🏆' : ''}</Text>
                        <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 44, fontWeight: '700' }}>{formatPoints(t.points)}</Text>
                        <Text numberOfLines={2} style={{ color: '#ffffffcc', fontSize: 11, textAlign: 'center', paddingHorizontal: 6 }}>{t.members.map((pid) => name(pid).split(' ')[0]).join(', ')}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={{ textAlign: 'center', padding: space.sm, color: c.text, fontWeight: '600' }}>
                    {roundsCounted === 0 ? 'No rounds played yet' : `${lead ? `Team ${lead} leads` : 'All square'} after ${roundsCounted} round${roundsCounted === 1 ? '' : 's'}`}
                  </Text>
                </View>
              );
            })()}
            <EventStory e={e} rounds={rounds} />
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
                    {e.teamOf?.[row.playerId] ? (
                      <View style={{ backgroundColor: teamColor(e.teamOf[row.playerId]).color, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>TEAM {e.teamOf[row.playerId]}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Body muted style={{ width: 70, textAlign: 'center' }}>{row.wins}-{row.losses}-{row.halves}</Body>
                  <Text style={{ width: 44, textAlign: 'right', fontFamily: fonts.serif, fontWeight: '700', fontSize: 17, color: c.text }}>{formatPoints(row.points)}</Text>
                </View>
              ))}
              <Label style={{ textTransform: 'none', letterSpacing: 0 }}>Win 1 · halve ½ · Nassau matches count their points · every match counts, including side matches.</Label>
            </Card>
            {canAdd && <AddEventPlayer e={e} />}
            {e.rounds?.length ? <EventRounds e={e} /> : null}
                {(!e.rounds?.length || (e.schedule?.length ?? 0) > 0) && <ScheduleSection e={e} />}
            <Card>
              <H2>Results</H2>
              {matches.length === 0 ? <Body muted>No matches yet.</Body> : matches.map((m) => <MatchRow key={m.id} e={e} m={m} name={name} />)}
            </Card>
          </>
        )}

        {e.remote?.role !== 'viewer' && !e.rounds && (
          <Button small kind="ghost" title={e.teams ? 'Start an unscheduled match' : 'Start an unscheduled round'} onPress={() => router.push({ pathname: '/new-round', params: { eventId: e.id } })} />
        )}
        <ShareCard remote={e.remote} what="event" onShare={() => shareEvent(e.id)} />

        {eventRounds.length > 0 && (
          <Card>
            <H2>Rounds</H2>
            {eventRounds.map((r) => (
              <Pressable key={r.id} onPress={() => router.push(r.status === 'active' ? `/round/${r.id}` : `/round/${r.id}/results`)}>
                <View style={[styles.row, { justifyContent: 'space-between', paddingVertical: 6 }]}>
                  <Body>{shortCourseName(courseFor(r).name)} · {new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Body>
                  <Label>{r.status === 'active' ? 'In progress' : 'Final'}</Label>
                </View>
              </Pressable>
            ))}
          </Card>
        )}

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
      <Tip
        id="event"
        title="Your event"
        lines={['Tap any match or round to follow it live or see the result. Standings update automatically.', 'Share the join code so the rest of your group can follow along or keep score.']}
      />
    </>
  );
}
