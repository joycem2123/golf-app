import { useCourses } from '@/lib/courses';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { Calendar } from '@/components/calendar';
import { Body, Button, Card, Chip, Field, H2, Label, OptionRow, Stepper, Toggle, styles } from '@/components/ui';
import { formatDate, formatTime, pad, today } from '@/lib/dates';
import { shuffle } from '@/lib/format';
import { gameInfo, GAMES, type GameKind } from '@/lib/games';
import { shortCourseName } from '@/lib/round';
import { newId, useEvent, useStore, type ScheduledMatch } from '@/store/store';
import { space, useColors } from '@/theme';

/** Formats where two sides play each other. */
const HEAD_TO_HEAD: GameKind[] = ['singles', 'bestBall', 'alternateShot', 'nassau', 'vegas', 'scramble', 'shamble'];

export default function ScheduleMatch() {
  const c = useColors();
  const { id, matchId } = useLocalSearchParams<{ id: string; matchId?: string }>();
  const e = useEvent(id);
  const courses = useCourses();
  const players = useStore((s) => s.players);
  const save = useStore((s) => s.saveScheduled);
  const remove = useStore((s) => s.removeScheduled);
  const existing = e?.schedule?.find((m) => m.id === matchId);

  const [label, setLabel] = useState(existing?.label ?? '');
  const [date, setDate] = useState(existing?.date ?? today());
  const [hasTime, setHasTime] = useState(!!existing?.time);
  const [hour, setHour] = useState(existing?.time ? Number(existing.time.split(':')[0]) : 9);
  const [minute, setMinute] = useState(existing?.time ? Number(existing.time.split(':')[1]) : 0);
  const [courseId, setCourseId] = useState<string | undefined>(existing?.courseId);
  const [kind, setKind] = useState<GameKind | undefined>(existing?.kind as GameKind | undefined);
  const [sideA, setSideA] = useState<string[]>(existing?.sideA ?? []);
  const [sideB, setSideB] = useState<string[]>(existing?.sideB ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? '');

  if (!e) return <Body>Event not found.</Body>;
  const name = (pid: string) => players.find((p) => p.id === pid)?.name ?? '?';
  const headToHead = !kind || HEAD_TO_HEAD.includes(kind);
  // Players per side for one scheduled match (best ball defaults to 2 v 2; Nassau to 1 v 1).
  const sizes = kind ? gameInfo(kind).teamSizes : undefined;
  const perSide = sizes ? (kind === 'nassau' ? 1 : sizes.includes(2) ? 2 : sizes[0]) : null;
  const time = hasTime ? `${pad(hour)}:${pad(minute)}` : undefined;

  // Tap a player: none → side A → side B → none (or simply in/out for individual games).
  const cycle = (pid: string) => {
    if (e.teams) {
      const onA = e.teams.A.playerIds.includes(pid);
      const [side, setSide] = onA ? [sideA, setSideA] : [sideB, setSideB];
      setSide(side.includes(pid) ? side.filter((x) => x !== pid) : [...side, pid]);
      return;
    }
    if (!headToHead) {
      setSideA((a) => (a.includes(pid) ? a.filter((x) => x !== pid) : [...a, pid]));
      return;
    }
    if (sideA.includes(pid)) {
      setSideA((a) => a.filter((x) => x !== pid));
      setSideB((b) => [...b, pid]);
    } else if (sideB.includes(pid)) setSideB((b) => b.filter((x) => x !== pid));
    else setSideA((a) => [...a, pid]);
  };

  const randomize = () => {
    const n = perSide ?? 1;
    if (e.teams) {
      setSideA(shuffle(e.teams.A.playerIds).slice(0, n));
      setSideB(shuffle(e.teams.B.playerIds).slice(0, n));
    } else {
      const picked = shuffle(e.playerIds).slice(0, n * 2);
      setSideA(picked.slice(0, n));
      setSideB(picked.slice(n));
    }
  };

  const sizeWarning =
    perSide && (sideA.length || sideB.length) && (sideA.length !== perSide || sideB.length !== perSide)
      ? `${gameInfo(kind!).name} is ${perSide} v ${perSide}`
      : null;

  const onSave = () => {
    const m: ScheduledMatch = {
      id: existing?.id ?? newId(),
      date,
      time,
      courseId,
      kind,
      sideA,
      sideB: headToHead ? sideB : [],
      label: label.trim() || undefined,
      notes: notes.trim() || undefined,
      roundId: existing?.roundId,
    };
    save(e.id, m);
    router.back();
  };

  const chipColor = (pid: string) => (sideA.includes(pid) ? c.teamA : sideB.includes(pid) ? c.teamB : undefined);

  return (
    <>
      <Stack.Screen options={{ title: existing ? 'Edit match' : 'Schedule a match' }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <Field label="Name (optional)" value={label} onChangeText={setLabel} placeholder={e.type === 'season' ? 'Week 3' : 'Day 1 · Morning'} />

        <Label>Date · {formatDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</Label>
        <Calendar selected={date} onSelect={setDate} />

        <Card>
          <Toggle label="Tee time" hint={hasTime ? formatTime(time) : 'Not set'} value={hasTime} onChange={setHasTime} />
          {hasTime && (
            <View style={[styles.row, { justifyContent: 'space-around' }]}>
              <OptionRow label="Hour">
                <Stepper value={hour} min={5} max={20} onChange={setHour} format={(h) => `${((h + 11) % 12) + 1}${h >= 12 ? 'pm' : 'am'}`} />
              </OptionRow>
              <OptionRow label="Minute">
                <Stepper value={minute} min={0} max={55} step={5} onChange={setMinute} format={(m) => `:${pad(m)}`} />
              </OptionRow>
            </View>
          )}
        </Card>

        <Card>
          <H2>Course</H2>
          <View style={styles.wrap}>
            <Chip label="Decide later" selected={!courseId} onPress={() => setCourseId(undefined)} />
            {courses.map((co) => (
              <Chip key={co.id} label={shortCourseName(co.name)} selected={courseId === co.id} onPress={() => setCourseId(co.id)} />
            ))}
          </View>
        </Card>

        <Card>
          <H2>Format</H2>
          <View style={styles.wrap}>
            <Chip label="Decide later" selected={!kind} onPress={() => setKind(undefined)} />
            {GAMES.map((g) => (
              <Chip key={g.kind} label={g.name} selected={kind === g.kind} onPress={() => setKind(g.kind)} />
            ))}
          </View>
        </Card>

        <Card>
          <H2>{headToHead ? 'Matchup' : 'Players'}</H2>
          <Label style={{ textTransform: 'none', letterSpacing: 0 }}>
            {e.teams
              ? `Tap players to put them in this match.`
              : headToHead
                ? 'Tap once for side A (green), again for side B (navy), again to remove.'
                : 'Tap the players in this group.'}
          </Label>
          {e.teams ? (
            (['A', 'B'] as const).map((t) => (
              <View key={t} style={{ gap: space.xs }}>
                <Text style={{ color: t === 'A' ? c.teamA : c.teamB, fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>{e.teams![t].name.toUpperCase()}</Text>
                <View style={styles.wrap}>
                  {e.teams![t].playerIds.map((pid) => (
                    <Chip key={pid} label={name(pid)} selected={(t === 'A' ? sideA : sideB).includes(pid)} color={t === 'A' ? c.teamA : c.teamB} onPress={() => cycle(pid)} />
                  ))}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.wrap}>
              {e.playerIds.map((pid) => (
                <Chip key={pid} label={name(pid)} selected={sideA.includes(pid) || sideB.includes(pid)} color={chipColor(pid)} onPress={() => cycle(pid)} />
              ))}
            </View>
          )}
          {headToHead && (sideA.length > 0 || sideB.length > 0) && (
            <Body>
              <Text style={{ color: c.teamA, fontWeight: '700' }}>{sideA.map(name).join(' & ') || '—'}</Text>
              <Text style={{ color: c.muted }}>  v  </Text>
              <Text style={{ color: c.teamB, fontWeight: '700' }}>{sideB.map(name).join(' & ') || '—'}</Text>
            </Body>
          )}
          {headToHead && <Button small kind="secondary" title={`Randomize ${perSide ?? 1} v ${perSide ?? 1}`} onPress={randomize} />}
          {sizeWarning ? <Body style={{ color: c.danger }}>{sizeWarning}</Body> : null}
        </Card>

        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Carts booked, dinner after…" multiline />

        <Button title={existing ? 'Save changes' : 'Add to schedule'} onPress={onSave} />
        {existing && !existing.roundId && (
          <Button
            title="Remove from schedule"
            kind="ghost"
            onPress={() =>
              Alert.alert('Remove this match?', '', [
                { text: 'Cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => { remove(e.id, existing.id); router.back(); } },
              ])
            }
          />
        )}
      </ScrollView>
    </>
  );
}
