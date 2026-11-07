/**
 * Upload scorecard: photo of a finished card → check the scores → set up the round as usual → results.
 */
import { searchCourses, type Course, type Tee } from '@golf/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Sheet } from '@/components/round-setup';
import { Body, Button, Card, Chip, Field, H2, Label, Segmented } from '@/components/ui';
import { getCourse, useCourses } from '@/lib/courses';
import { parseIndex } from '@/lib/format';
import { today } from '@/lib/dates';
import { holesOnCard, readRoundPhoto, setPendingScan, suggestPlayer, type ScannedRound } from '@/lib/round-scan';
import { useMe } from '@/lib/me';
import { pickScorecard } from '@/lib/scan';
import { track } from '@/lib/usage';
import { newId, useStore, type SavedPlayer } from '@/store/store';
import { radius, space, useColors } from '@/theme';

const teeLabel = (t: Tee) => `${t.name}${t.gender === 'F' ? ' (W)' : ''}`;

/** The player's version (men's or women's) of the tee everyone played. */
function teeForGender(course: Course, name: string | undefined, gender: 'M' | 'F'): Tee | undefined {
  const same = course.tees.filter((t) => t.name === name);
  return same.find((t) => (t.gender ?? 'M') === gender) ?? same[0];
}

const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];

function ScoreCell({ value, unsure, onChange, label }: { value: number | null; unsure: boolean; onChange: (v: number | null) => void; label: string }) {
  const c = useColors();
  return (
    <TextInput
      value={value === null ? '' : String(value)}
      onChangeText={(t) => {
        const n = parseInt(t.replace(/[^0-9]/g, '').slice(0, 2), 10);
        onChange(Number.isFinite(n) && n > 0 ? n : null);
      }}
      keyboardType="number-pad"
      selectTextOnFocus
      accessibilityLabel={label}
      style={{
        flex: 1, flexBasis: 0, minWidth: 0, height: 36, textAlign: 'center', fontSize: 15, fontWeight: '700', color: c.text, padding: 0,
        borderWidth: unsure ? 2 : 1, borderColor: unsure ? c.brandGold : c.border, borderRadius: radius.sm,
        backgroundColor: unsure ? '#B4895422' : c.card,
      }}
    />
  );
}

export default function UploadScorecard() {
  const c = useColors();
  const [phase, setPhase] = useState<'pick' | 'reading' | 'review'>('pick');
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<ScannedRound | null>(null);
  const { isMe } = useMe();
  // Me and my friends (and people I've played with), to match names on the card.
  const people = useStore((s) => s.players);
  const upsertPlayer = useStore((s) => s.upsertPlayer);
  const courses = useCourses();
  const [courseSheet, setCourseSheet] = useState(false);
  const [courseQuery, setCourseQuery] = useState('');
  const [friendQuery, setFriendQuery] = useState<Record<number, string>>({});
  const [teeOpen, setTeeOpen] = useState<number | null>(null);

  const read = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const photo = await pickScorecard(source);
      if (!photo) return;
      setPhase('reading');
      const read = await readRoundPhoto(photo);
      // The date written on the card, if there is one (and it isn't in the future); otherwise today.
      const onCard = read.date && /^\d{4}-\d{2}-\d{2}$/.test(read.date) && read.date <= today() ? read.date : today();
      // The course named on the card, if we know it.
      const match = read.courseName ? searchCourses(read.courseName, courses)[0] : undefined;
      setCard({ ...read, date: onCard, courseId: match?.id });
      setPhase('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('pick');
    }
  };

  const setRow = (i: number, patch: Partial<ScannedRound['rows'][number]>) =>
    setCard((cd) => (cd ? { ...cd, rows: cd.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : cd));
  const setScore = (i: number, h: number, v: number | null) =>
    setCard((cd) =>
      cd ? { ...cd, rows: cd.rows.map((r, j) => (j === i ? { ...r, scores: r.scores.map((s, k) => (k === h - 1 ? v : s)), unsure: r.unsure.filter((u) => u !== h) } : r)) } : cd,
    );

  if (phase === 'reading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl }}>
        <ActivityIndicator size="large" color={c.primary} />
        <H2>Reading the scorecard…</H2>
        <Body muted style={{ textAlign: 'center' }}>This usually takes 10 to 20 seconds.</Body>
      </View>
    );
  }

  if (phase === 'pick' || !card) {
    return (
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Card style={{ gap: space.sm }}>
          <H2>Upload a scorecard</H2>
          <Body muted>Played a round without the app? Take a photo of the finished scorecard. We’ll read everyone’s scores, you check them, then set up the players and games as usual and go straight to the results.</Body>
          <Body muted>Tips: lay the card flat, in good light, with the whole card in the photo.</Body>
        </Card>
        {error ? <Body style={{ color: c.danger }}>{error}</Body> : null}
        <Button title="Take a photo" onPress={() => read('camera')} />
        <Button title="Choose from photos" kind="secondary" onPress={() => read('library')} />
      </ScrollView>
    );
  }

  const holes = holesOnCard(card);
  const nines = [FRONT, BACK].filter((n) => n.some((h) => holes.includes(h)));
  const unsureCount = card.rows.reduce((s, r) => s + r.unsure.length, 0);
  const course = card.courseId ? (courses.find((x) => x.id === card.courseId) ?? getCourse(card.courseId)) : undefined;
  const teeNames = course ? [...new Set(course.tees.map((t) => t.name))] : [];
  const who = (p: { id: string; name: string }) => `${p.name}${isMe(p.id) ? ' (you)' : ''}`;
  const genderOf = (r: ScannedRound['rows'][number]) => (r.playerId ? people.find((p) => p.id === r.playerId)?.gender : r.newGender) ?? 'M';
  const teeOf = (r: ScannedRound['rows'][number]) => (course ? (r.teeId ? course.tees.find((t) => t.id === r.teeId) : teeForGender(course, card.teeName, genderOf(r))) : undefined);

  // What's still needed before moving on.
  const rowProblem = (r: ScannedRound['rows'][number]) =>
    !r.name.trim()
      ? 'needs a name'
      : r.playerId
        ? null
        : r.who === 'new'
          ? parseIndex(r.newIndex ?? '') === null
            ? 'needs a handicap index'
            : null
          : 'needs a player';
  const ids = card.rows.map((r) => r.playerId).filter(Boolean);
  const problem = !course
    ? 'Choose the course'
    : !card.teeName
      ? 'Choose the tees'
      : card.rows.length === 0
        ? 'No rows left'
        : card.rows.map((r, i) => (rowProblem(r) ? `Row ${i + 1} ${rowProblem(r)}` : null)).find(Boolean) ??
          (new Set(ids).size !== ids.length ? 'The same player is on two rows' : null);

  const next = () => {
    if (problem || !course) return;
    // Add anyone new, then hand the players and tees to the round setup.
    const rows = card.rows.map((r) => {
      if (r.playerId) return r;
      const p: SavedPlayer = { id: newId(), name: r.name.trim(), handicapIndex: parseIndex(r.newIndex ?? '') ?? 0, gender: r.newGender ?? 'M' };
      upsertPlayer(p);
      return { ...r, playerId: p.id };
    });
    const roster = rows.map((r) => ({ id: r.playerId!, teeId: (r.teeId && course.tees.some((t) => t.id === r.teeId) ? r.teeId : teeForGender(course, card.teeName, genderOf(r))?.id) ?? course.tees[0].id }));
    const done = { ...card, rows, roster };
    setCard(done);
    setPendingScan(done);
    track('scorecard_upload_reviewed', { rows: rows.length, holes: holes.length, new_players: card.rows.filter((r) => !r.playerId).length });
    router.push({ pathname: '/new-round', params: { scan: '1' } });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
      <Card style={{ gap: space.xs }}>
        <H2>Check the scorecard</H2>
        <Body muted>
          Confirm the course, tees and who played, and tap any score to fix it.{unsureCount ? ` ${unsureCount} score${unsureCount === 1 ? ' was' : 's were'} hard to read and ${unsureCount === 1 ? 'is' : 'are'} outlined in gold.` : ''}
        </Body>
        {card.notes ? <Label style={{ textTransform: 'none', letterSpacing: 0 }}>{card.notes}</Label> : null}
      </Card>

      {/* Course */}
      <Pressable
        onPress={() => setCourseSheet(true)}
        accessibilityRole="button"
        accessibilityLabel={course ? `Course: ${course.name}. Tap to change.` : 'Choose the course'}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: course ? c.border : c.danger, borderRadius: radius.md, padding: space.md, backgroundColor: c.card, opacity: pressed ? 0.6 : 1 })}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>COURSE</Text>
          <Text style={{ color: course ? c.text : c.muted, fontSize: 16, fontWeight: '600' }}>{course ? course.name : 'Choose the course'}</Text>
          {!course && card.courseName ? <Text style={{ color: c.muted, fontSize: 12 }}>The card says “{card.courseName}”</Text> : null}
        </View>
        <Text style={{ color: c.primary, fontSize: 16 }}>▾</Text>
      </Pressable>

      {/* Tees */}
      {course && (
        <Card style={{ gap: space.sm }}>
          <H2>Tees played</H2>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {teeNames.map((n) => (
              <Chip key={n} label={n} selected={card.teeName === n} onPress={() => setCard({ ...card, teeName: n, rows: card.rows.map((r) => ({ ...r, teeId: undefined })) })} />
            ))}
          </View>
          <Label style={{ textTransform: 'none', letterSpacing: 0 }}>For everyone. Change one player’s tee on their row below.</Label>
        </Card>
      )}

      <View style={{ flexDirection: 'row' }}>
        <DateField label="Date played" value={card.date ?? today()} max={today()} onChange={(d) => setCard({ ...card, date: d })} />
      </View>

      {card.rows.map((r, i) => {
        const total = (list: number[]) => list.reduce((s, h) => s + (r.scores[h - 1] ?? 0), 0);
        const taken = card.rows.filter((x, j) => j !== i && x.playerId).map((x) => x.playerId!);
        const linked = r.playerId ? people.find((p) => p.id === r.playerId) : undefined;
        const guess = r.playerId === undefined ? suggestPlayer(r.name, people, taken) : null;
        const unknown = !linked && !guess;
        const q = (friendQuery[i] ?? '').trim().toLowerCase();
        const choices = people.filter((p) => !taken.includes(p.id) && (!q || p.name.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
        const tee = teeOf(r);
        return (
          <Card key={i} style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
              <Field label={`Row ${i + 1} name`} value={r.name} onChangeText={(t) => setRow(i, { name: t, ...(r.who === 'new' ? {} : { playerId: undefined }) })} />
              <Pressable onPress={() => setCard({ ...card, rows: card.rows.filter((_, j) => j !== i) })} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove row ${i + 1}`} style={{ paddingBottom: 12 }}>
                <Text style={{ color: c.danger, fontWeight: '600' }}>Remove</Text>
              </Pressable>
            </View>

            {/* Same name as me or a friend: ask if it's them. */}
            {guess && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.sm }}>
                <Text style={{ flex: 1, color: c.text, fontWeight: '600' }}>Is this {who(guess)}?</Text>
                <Pressable onPress={() => setRow(i, { playerId: guess.id, who: undefined })} accessibilityRole="button" accessibilityLabel={`Yes, row ${i + 1} is ${guess.name}`} style={{ backgroundColor: c.primary, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 14 }}>
                  <Text style={{ color: c.onPrimary, fontWeight: '700' }}>Yes</Text>
                </Pressable>
                <Pressable onPress={() => setRow(i, { playerId: null })} accessibilityRole="button" accessibilityLabel={`No, row ${i + 1} is not ${guess.name}`} style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 14, backgroundColor: c.card }}>
                  <Text style={{ color: c.text, fontWeight: '700' }}>No</Text>
                </Pressable>
              </View>
            )}
            {linked && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Text style={{ flex: 1, color: c.primary, fontWeight: '700' }}>✓ {who(linked)} · Index {linked.handicapIndex}</Text>
                <Pressable onPress={() => setRow(i, { playerId: null, who: undefined })} hitSlop={8} accessibilityRole="button">
                  <Text style={{ color: c.muted, fontWeight: '600' }}>Not them</Text>
                </Pressable>
              </View>
            )}

            {/* No match: one of my friends, or someone new? */}
            {unknown && (
              <View style={{ gap: space.sm, backgroundColor: c.chip, borderRadius: radius.md, padding: space.sm }}>
                <Text style={{ color: c.text, fontWeight: '700' }}>Is this one of your friends?</Text>
                <Segmented
                  options={[{ value: 'friend', label: 'Yes, pick a friend' }, { value: 'new', label: 'No, someone new' }]}
                  value={(r.who ?? '') as 'friend' | 'new'}
                  onChange={(v) => setRow(i, { who: v })}
                />
                {r.who === 'friend' && (
                  <View style={{ gap: space.sm }}>
                    {people.length > 8 && <Field label="Search" value={friendQuery[i] ?? ''} onChangeText={(t) => setFriendQuery({ ...friendQuery, [i]: t })} placeholder="Name" />}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                      {choices.map((p) => (
                        <Chip key={p.id} label={who(p)} onPress={() => setRow(i, { playerId: p.id, who: undefined })} />
                      ))}
                    </View>
                    {choices.length === 0 && <Body muted>No friends to choose from. Pick “No, someone new”.</Body>}
                  </View>
                )}
                {r.who === 'new' && (
                  <View style={{ gap: space.sm }}>
                    <Field
                      label="Handicap index (required)"
                      value={r.newIndex ?? ''}
                      onChangeText={(t) => setRow(i, { newIndex: t })}
                      placeholder="12.4 or +1.2"
                      keyboardType="numbers-and-punctuation"
                    />
                    {r.newIndex && parseIndex(r.newIndex) === null ? <Text style={{ color: c.danger, fontSize: 12 }}>Enter an index like 12.4 or +1.2</Text> : null}
                    <Segmented options={[{ value: 'M', label: "Men's tees" }, { value: 'F', label: "Women's tees" }]} value={r.newGender ?? 'M'} onChange={(v) => setRow(i, { newGender: v, teeId: undefined })} />
                    <Label style={{ textTransform: 'none', letterSpacing: 0 }}>“{r.name.trim() || `Row ${i + 1}`}” will be added to your players.</Label>
                  </View>
                )}
              </View>
            )}

            {/* This player's tee */}
            {course && card.teeName && (
              <View style={{ gap: space.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, color: c.muted, fontSize: 13 }}>Tee: {tee ? `${teeLabel(tee)} · ${tee.courseRating}/${tee.slope}` : '–'}</Text>
                  <Pressable onPress={() => setTeeOpen(teeOpen === i ? null : i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Change row ${i + 1} tee`}>
                    <Text style={{ color: c.primary, fontWeight: '600', fontSize: 13 }}>{teeOpen === i ? 'Done' : 'Change'}</Text>
                  </Pressable>
                </View>
                {teeOpen === i && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {course.tees.map((t) => (
                      <Chip key={t.id} label={teeLabel(t)} selected={tee?.id === t.id} onPress={() => { setRow(i, { teeId: t.id }); setTeeOpen(null); }} />
                    ))}
                  </View>
                )}
              </View>
            )}

            {nines.map((nine) => (
              <View key={nine[0]} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', gap: 3 }}>
                  {nine.map((h) => <Text key={h} style={{ flex: 1, textAlign: 'center', color: c.muted, fontSize: 11 }}>{h}</Text>)}
                  <Text style={{ width: 40, textAlign: 'center', color: c.muted, fontSize: 11, fontWeight: '700' }}>{nine[0] === 1 ? 'OUT' : 'IN'}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
                  {nine.map((h) => (
                    <ScoreCell key={h} value={r.scores[h - 1]} unsure={r.unsure.includes(h)} onChange={(v) => setScore(i, h, v)} label={`${r.name || `Row ${i + 1}`} hole ${h}`} />
                  ))}
                  <Text style={{ width: 40, textAlign: 'center', color: c.text, fontWeight: '800' }}>{total(nine) || '–'}</Text>
                </View>
              </View>
            ))}
            {nines.length > 1 && <Label style={{ textTransform: 'none', letterSpacing: 0, textAlign: 'right' }}>Total {total([...FRONT, ...BACK])}</Label>}
          </Card>
        );
      })}

      {problem ? <Body style={{ color: c.danger, textAlign: 'center' }}>{problem}</Body> : null}
      <Button title="Next: teams & games" disabled={!!problem} onPress={next} />
      <Button title="Use a different photo" kind="ghost" onPress={() => { setCard(null); setPhase('pick'); }} />

      <Sheet visible={courseSheet} onClose={() => setCourseSheet(false)} title="Choose the course">
        <View style={{ gap: space.sm }}>
          <Field label="Search courses" value={courseQuery} onChangeText={setCourseQuery} placeholder="Course name or city" />
          {searchCourses(courseQuery, courses).slice(0, 30).map((co) => (
            <Pressable
              key={co.id}
              onPress={() => { setCard({ ...card, courseId: co.id, teeName: undefined, rows: card.rows.map((r) => ({ ...r, teeId: undefined })) }); setCourseSheet(false); }}
              accessibilityRole="button"
              style={({ pressed }) => ({ paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{co.name}{co.id === card.courseId ? '  ✓' : ''}</Text>
              <Text style={{ color: c.muted, fontSize: 12 }}>{[co.city, co.region].filter(Boolean).join(', ')}</Text>
            </Pressable>
          ))}
          <Button small kind="ghost" title="Course not listed? Add it in More → Courses" onPress={() => { setCourseSheet(false); router.push('/course/new'); }} />
        </View>
      </Sheet>
    </ScrollView>
  );
}
