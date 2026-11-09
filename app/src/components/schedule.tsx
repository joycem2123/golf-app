import { getCourse } from '@/lib/courses';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { formatDate, formatTime, today } from '@/lib/dates';
import { gameInfo, type GameKind } from '@/lib/games';
import { evaluate, isResult, shortCourseName } from '@/lib/round';
import { canStartOn } from '@/lib/event-calendar';
import { DateLock } from '@/components/event-rounds';
import { useStore, type EventRecord, type ScheduledMatch } from '@/store/store';
import { radius, space, teamColor, useColors } from '@/theme';
import { Calendar } from './calendar';
import { Body, Button, Card, H2, Label, Segmented } from './ui';

function MatchItem({ e, m }: { e: EventRecord; m: ScheduledMatch }) {
  const c = useColors();
  const players = useStore((s) => s.players);
  const round = useStore((s) => s.rounds.find((r) => r.id === m.roundId));
  const name = (pid: string) => players.find((p) => p.id === pid)?.name ?? '?';
  const course = m.courseId ? getCourse(m.courseId) : undefined;
  const canEdit = e.remote?.role !== 'viewer';
  const res = round ? evaluate(round)[0] : undefined;
  const status = round ? (round.status === 'complete' ? 'Final' : 'Live') : null;

  return (
    <Pressable
      onPress={() => {
        if (round) router.push(round.status === 'complete' ? `/round/${round.id}/results` : `/round/${round.id}`);
        else if (canEdit) router.push({ pathname: '/event/[id]/match', params: { id: e.id, matchId: m.id } });
      }}>
      {({ pressed }) => (
        <View style={{ flexDirection: 'row', gap: space.md, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 }}>
          <View style={{ width: 58, alignItems: 'center' }}>
            <Text style={{ color: c.primary, fontWeight: '800', fontSize: 13 }}>{m.time ? formatTime(m.time) : 'TBD'}</Text>
            {status && (
              <View style={{ marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: status === 'Live' ? c.under : c.primary }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>{status.toUpperCase()}</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>
              {m.label ?? (m.kind ? gameInfo(m.kind as GameKind).name : 'Match')}
            </Text>
            <Text style={{ color: c.muted, fontSize: 13 }}>
              {[m.label && m.kind ? gameInfo(m.kind as GameKind).name : null, course ? shortCourseName(course.name) : 'Course TBD'].filter(Boolean).join(' · ')}
            </Text>
            {(m.sideA.length > 0 || m.sideB.length > 0) && (
              <Text style={{ fontSize: 14 }}>
                <Text style={{ color: teamColor('A', e.teamColors).color, fontWeight: '600' }}>{m.sideA.map(name).join(' & ')}</Text>
                {m.sideB.length > 0 && <Text style={{ color: c.muted }}>  v  </Text>}
                <Text style={{ color: teamColor('B', e.teamColors).color, fontWeight: '600' }}>{m.sideB.map(name).join(' & ')}</Text>
              </Text>
            )}
            {res && isResult(res) ? <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{res.summary}</Text> : null}
            {m.notes ? <Text style={{ color: c.muted, fontSize: 12, fontStyle: 'italic' }}>{m.notes}</Text> : null}
          </View>
          {!round && canEdit && (
            <View style={{ justifyContent: 'center' }}>
              {canStartOn(m.date) ? <Button small title="Start" onPress={() => router.push({ pathname: '/new-round', params: { eventId: e.id, matchId: m.id } })} /> : <DateLock date={m.date} />}
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

export function ScheduleSection({ e }: { e: EventRecord }) {
  const c = useColors();
  const [view, setView] = useState<'list' | 'calendar'>(e.type === 'season' ? 'calendar' : 'list');
  const schedule = [...(e.schedule ?? [])].sort((a, b) => `${a.date}${a.time ?? '99'}`.localeCompare(`${b.date}${b.time ?? '99'}`));
  const firstUpcoming = schedule.find((m) => m.date >= today())?.date;
  const [picked, setDay] = useState<string | null>(null);
  const day = picked ?? firstUpcoming ?? schedule.at(-1)?.date ?? today();
  const marks: Record<string, number> = {};
  for (const m of schedule) marks[m.date] = (marks[m.date] ?? 0) + 1;
  const byDate = schedule.reduce<Record<string, ScheduledMatch[]>>((acc, m) => ((acc[m.date] ??= []).push(m), acc), {});
  const canEdit = e.remote?.role !== 'viewer';

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <H2>Schedule</H2>
        <Label>{schedule.length} match{schedule.length === 1 ? '' : 'es'}</Label>
      </View>
      {schedule.length > 0 && (
        <Segmented options={[{ value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar' }]} value={view} onChange={setView} />
      )}

      {schedule.length === 0 && <Body muted>Plan your matches ahead of time: date, tee time, course, format and who’s playing.</Body>}

      {view === 'list' &&
        Object.entries(byDate).map(([date, list]) => (
          <View key={date}>
            <Text style={{ color: date < today() ? c.muted : c.accent, fontWeight: '800', fontSize: 12, letterSpacing: 1.2, marginTop: space.sm }}>
              {formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
            </Text>
            {list.map((m) => <MatchItem key={m.id} e={e} m={m} />)}
          </View>
        ))}

      {view === 'calendar' && schedule.length > 0 && (
        <>
          <Calendar key={picked ? 'picked' : day} selected={day} onSelect={setDay} marks={marks} initial={day} />
          <Text style={{ color: c.accent, fontWeight: '800', fontSize: 12, letterSpacing: 1.2, marginTop: space.sm }}>
            {formatDate(day, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
          </Text>
          {(byDate[day] ?? []).length === 0 ? <Body muted>Nothing scheduled this day.</Body> : byDate[day].map((m) => <MatchItem key={m.id} e={e} m={m} />)}
        </>
      )}

      {canEdit && (
        <Button
          title="+ Add a match"
          kind="secondary"
          onPress={() => router.push({ pathname: '/event/[id]/match', params: { id: e.id } })}
        />
      )}
    </Card>
  );
}
