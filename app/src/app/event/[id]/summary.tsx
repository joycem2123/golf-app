/**
 * An event's final summary: the champion (team or player) and final score, then the rest of the podium. Opened with
 * confetti right after Complete Event, and any time later from the event page.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Confetti } from '@/components/confetti';
import { EventStory } from '@/components/event-story';
import { usePlayerName } from '@/components/fedex-standings';
import { Button, Card } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { eventSummary } from '@/lib/event-summary';
import { formatPoints } from '@/lib/events';
import { useEvent, useStore } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';

export { ErrorBoundary } from '@/components/error-screen';

const MEDAL = ['🥇', '🥈', '🥉'];
const PLACE = ['Champion', 'Runner-up', 'Third place'];

export default function EventSummaryScreen() {
  const c = useColors();
  const { id, celebrate } = useLocalSearchParams<{ id: string; celebrate?: string }>();
  const e = useEvent(id);
  const rounds = useStore((s) => s.rounds);
  const summary = useMemo(() => (e ? eventSummary(e, rounds) : null), [e, rounds]);
  const name = usePlayerName();
  if (!e || !summary) return null;
  const dates = e.startDate ? `${formatDate(e.startDate, { month: 'short', day: 'numeric' })}${e.endDate && e.endDate !== e.startDate ? ` – ${formatDate(e.endDate, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}` : '';
  const kind = e.type === 'cup' ? 'Ryder Cup' : e.type === 'season' ? (e.fedex ? 'Points Race' : e.individual ? 'Individual Points' : 'Season') : 'Trip';

  const hero = (label: string, title: string, sub: string, color: string) => (
    <View style={{ backgroundColor: color, borderRadius: radius.lg, paddingVertical: space.xl, paddingHorizontal: space.lg, alignItems: 'center', gap: 6 }}>
      <Text style={{ fontSize: 54 }}>🏆</Text>
      <Text style={{ color: '#F3E3B5', fontSize: 12, fontWeight: '800', letterSpacing: 2 }}>{label}</Text>
      <Text style={{ color: '#fff', fontFamily: fonts.serif, fontWeight: '700', fontSize: 32, textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: '#ffffffd0', fontSize: 15, textAlign: 'center' }}>{sub}</Text>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Final Results' }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text style={{ color: c.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>{kind.toUpperCase()} · FINAL</Text>
          <Text style={{ color: c.text, fontFamily: fonts.serif, fontWeight: '700', fontSize: 22, textAlign: 'center' }}>{e.name}</Text>
          {dates ? <Text style={{ color: c.muted, fontSize: 13 }}>{dates} · {summary.rounds} round{summary.rounds === 1 ? '' : 's'} played</Text> : null}
        </View>

        {summary.kind === 'teams' ? (
          <>
            {summary.tie
              ? hero('ALL SQUARE', 'It’s a tie', `${formatPoints(summary.teams[0].points)} – ${formatPoints(summary.teams[1].points)}`, c.brand)
              : hero('CHAMPIONS', summary.teams[0].name, summary.teams[0].members.map((m) => name(m).split(' ')[0]).join(', '), summary.teams[0].color)}
            <Card style={{ gap: space.sm }}>
              <Text style={{ color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>FINAL SCORE</Text>
              {summary.teams.map((t, i) => (
                <View key={t.letter} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
                  <View style={{ width: 8, alignSelf: 'stretch', borderRadius: 4, backgroundColor: t.color }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontWeight: '700', fontSize: 17 }}>{!summary.tie && i === 0 ? '🏆 ' : ''}{t.name}</Text>
                    <Text style={{ color: c.muted, fontSize: 12 }}>{t.members.map(name).join(', ')}</Text>
                  </View>
                  <Text style={{ color: t.color, fontFamily: fonts.serif, fontWeight: '700', fontSize: 30 }}>{formatPoints(t.points)}</Text>
                </View>
              ))}
              {summary.note ? <Text style={{ color: c.muted, fontSize: 13 }}>{summary.note}</Text> : null}
            </Card>
          </>
        ) : summary.podium.length ? (
          <>
            {(() => {
              const champs = summary.podium.filter((p) => p.position === 1);
              return hero(champs.length > 1 ? 'CO-CHAMPIONS' : 'CHAMPION', champs.map((p) => name(p.playerId)).join(' & '), `${champs[0].score} · ${champs[0].detail ?? ''}`, c.brand);
            })()}
            <Card style={{ gap: 0 }}>
              <Text style={{ color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 }}>PODIUM · {summary.label.toUpperCase()}</Text>
              {summary.podium.map((p, i) => (
                <View key={p.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
                  <Text style={{ fontSize: 30 }}>{MEDAL[p.position - 1] ?? '🏅'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>{(PLACE[p.position - 1] ?? `${p.position}th`).toUpperCase()}</Text>
                    <Text style={{ color: c.text, fontWeight: '700', fontSize: 17 }}>{name(p.playerId)}</Text>
                    {p.detail ? <Text style={{ color: c.muted, fontSize: 12 }}>{p.detail}</Text> : null}
                  </View>
                  <Text style={{ color: c.primary, fontFamily: fonts.serif, fontWeight: '700', fontSize: 22 }}>{p.score}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : (
          <Card><Text style={{ color: c.text }}>No results to show yet.</Text></Card>
        )}

        <EventStory e={e} rounds={rounds} autoWrite={!!celebrate} />
        <Button title="Done" onPress={() => router.back()} />
      </ScrollView>
      {celebrate ? <Confetti count={90} /> : null}
    </>
  );
}
