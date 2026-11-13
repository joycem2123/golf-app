import { validateTee, type Course, type Tee } from '@golf/engine';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Sheet } from '@/components/round-setup';
import { ShareCourseSheet } from '@/components/share-course';
import { resendSharedCourse } from '@/sync/courses';
import { useSession } from '@/sync/auth';
import { Body, Button, Card, Field, H2, Label, Segmented } from '@/components/ui';
import { getCourse, isAddedCourse, originalCourse } from '@/lib/courses';
import { useStore } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';
import { track } from '@/lib/usage';
import { pickScorecard, readScorecard } from '@/lib/scan';
import { reportCourseChange } from '@/sync/course-audit';

/** A number box that lets you type freely ("70." on the way to "70.6") and reports valid numbers. */
function NumField({ value, onChange, decimal, width, label, bad, tall }: { value: number | undefined; onChange: (n: number | undefined) => void; decimal?: boolean; width: number | '100%'; label: string; bad?: boolean; tall?: boolean }) {
  const c = useColors();
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(value === undefined ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <TextInput
      accessibilityLabel={label}
      value={text}
      onChangeText={(t) => {
        const clean = t.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
        setText(clean);
        if (clean === '') onChange(undefined);
        else if (!Number.isNaN(Number(clean))) onChange(Number(clean));
      }}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      selectTextOnFocus
      style={{ width, textAlign: 'center', fontSize: tall ? 17 : 15, color: c.text, paddingVertical: tall ? 0 : 6, height: tall ? BOX_H : undefined, borderWidth: bad ? 2 : 1, borderColor: bad ? c.danger : c.border, borderRadius: radius.sm, backgroundColor: bad ? '#FBEDEC' : c.card }}
    />
  );
}

const clone = (co: Course): Course => JSON.parse(JSON.stringify(co));
/** Rating, slope and par boxes share one height so they line up. */
const BOX_H = 44;

/** Shared empty list (a new [] in a store selector would redraw forever). */
const NONE: string[] = [];

export default function CourseEditor() {
  const { id, scanned, notes } = useLocalSearchParams<{ id: string; scanned?: string; notes?: string }>();
  const c = useColors();
  const saveCourse = useStore((s) => s.saveCourse);
  const resetCourse = useStore((s) => s.resetCourse);
  const deleteCourse = useStore((s) => s.deleteCourse);
  const added = isAddedCourse(id);
  const sharedWithMe = useStore((s) => s.sharedCourses?.[id]);
  const sharedTo = useStore((s) => s.courseShares?.[id] ?? NONE);
  const myCopy = useStore((s) => !!s.courseEdits?.[id]);
  const session = useSession();
  const canShare = !!session?.user && !session.user.is_anonymous;
  const [sharing, setSharing] = useState(false);
  const edited = useStore((s) => !!s.courseEdits?.[id]);
  const current = getCourse(id);
  const [draft, setDraft] = useState<Course | null>(() => (current ? clone(current) : null));
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [teeId, setTeeId] = useState<string | null>(null);
  // Adding a tee: name, rating and slope; holes are copied from an existing tee.
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRating, setNewRating] = useState<number | undefined>();
  const [newSlope, setNewSlope] = useState<number | undefined>();
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  // Updating the card from a photo of the scorecard.
  const [scanBusy, setScanBusy] = useState(false);
  const [scanMsg, setScanMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [fromPhoto, setFromPhoto] = useState(false);
  if (!current || !draft) return <Body>Course not found.</Body>;

  /** Read a photo of the card and put its numbers into my copy: matching tees are updated, new ones added. */
  const updateFromPhoto = async (source: 'camera' | 'library') => {
    setScanMsg(null);
    try {
      const image = await pickScorecard(source);
      if (!image) return;
      setScanBusy(true);
      const { course: read, notes: readNotes } = await readScorecard(image, { id: draft.id, name: draft.name, city: draft.city, region: draft.region });
      let updated = 0;
      let added = 0;
      const tees = draft.tees.map((t) => ({ ...t }));
      for (const r of read.tees) {
        const i = tees.findIndex((t) => t.name.trim().toLowerCase() === r.name.trim().toLowerCase() && (t.gender ?? 'M') === (r.gender ?? 'M'));
        if (i >= 0) {
          const t = tees[i];
          tees[i] = {
            ...t,
            courseRating: r.courseRating || t.courseRating,
            slope: r.slope || t.slope,
            holes: r.holes.length === t.holes.length ? r.holes.map((h, k) => ({ ...t.holes[k], par: h.par, strokeIndex: h.strokeIndex, ...(h.yards ? { yards: h.yards } : {}) })) : t.holes,
            par: r.holes.length === t.holes.length ? r.par : t.par,
          };
          updated++;
        } else {
          tees.push({ ...r, id: `${draft.id}-${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${(r.gender ?? 'M').toLowerCase()}-${Date.now().toString(36)}` });
          added++;
        }
      }
      setDraft({ ...draft, tees });
      setFromPhoto(true);
      track('course_photo_update', { updated, added });
      setScanMsg({ text: `Read from your photo: ${updated} tee${updated === 1 ? '' : 's'} updated${added ? `, ${added} added` : ''}. Check them against the card, then tap Save changes.${readNotes ? ` ${readNotes}` : ''}` });
    } catch (e) {
      setScanMsg({ text: e instanceof Error ? e.message : String(e), bad: true });
    } finally {
      setScanBusy(false);
    }
  };

  const tees = draft.tees.filter((t) => (t.gender ?? 'M') === gender);
  const tee = tees.find((t) => t.id === teeId) ?? tees[0];
  const genders = ['M', 'F'] as const;

  const updateTee = (fn: (t: Tee) => Tee) => setDraft((d) => (d && tee ? { ...d, tees: d.tees.map((t) => (t.id === tee.id ? fn(t) : t)) } : d));
  const setHole = (i: number, patch: Partial<Tee['holes'][number]>) =>
    updateTee((t) => {
      const holes = t.holes.map((h, k) => (k === i ? { ...h, ...patch } : h));
      return { ...t, holes, par: holes.reduce((s, h) => s + h.par, 0) };
    });
  const copyToOthers = () =>
    setDraft((d) =>
      d
        ? {
            ...d,
            tees: d.tees.map((t) =>
              t.id !== tee.id && (t.gender ?? 'M') === gender
                ? { ...t, par: tee.par, holes: t.holes.map((h, k) => ({ ...h, par: tee.holes[k]?.par ?? h.par, strokeIndex: tee.holes[k]?.strokeIndex ?? h.strokeIndex })) }
                : t,
            ),
          }
        : d,
    );

  const original = originalCourse(id);
  // Tees added to a built-in course (shown as new); on a course I added, any tee but the last can go.
  const isCustom = (t: Tee) => !isAddedCourse(id) && !original?.tees.some((o) => o.id === t.id);
  const canRemove = (t: Tee) => isCustom(t) || (isAddedCourse(id) && draft.tees.length > 1);
  const nameTaken = tees.some((t) => t.name.trim().toLowerCase() === newName.trim().toLowerCase());
  const addProblem = !newName.trim()
    ? 'Give the tee a name'
    : nameTaken
      ? `There’s already a ${newName.trim()} tee`
      : !newRating || newRating < 50 || newRating > 85
        ? 'Enter the course rating (e.g. 72.4)'
        : !newSlope || newSlope < 55 || newSlope > 155
          ? 'Enter the slope (55 to 155)'
          : null;
  const addTee = () => {
    if (addProblem) return;
    // No tees for this gender yet: copy the holes from any tee (pars and handicaps can then be changed).
    const from = tees.find((t) => t.id === copyFrom) ?? tees[0] ?? draft.tees[0];
    const slug = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const tid = `${draft.id}-${slug}-${gender.toLowerCase()}-${Date.now().toString(36)}`;
    const t: Tee = { id: tid, name: newName.trim(), gender, courseRating: newRating!, slope: newSlope!, par: from.par, holes: from.holes.map((h) => ({ ...h })) };
    setDraft((d) => (d ? { ...d, tees: [...d.tees, t] } : d));
    setTeeId(tid);
    setAdding(false);
    setNewName('');
    setNewRating(undefined);
    setNewSlope(undefined);
  };
  const removeTee = () =>
    Alert.alert(`Remove the ${tee.name} tee?`, 'Rounds already played on it are not affected.', [
      { text: 'Cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { setDraft((d) => (d ? { ...d, tees: d.tees.filter((t) => t.id !== tee.id) } : d)); setTeeId(null); } },
    ]);

  const problems = draft.tees.flatMap((t) => validateTee(t).map((p) => `${t.gender === 'F' ? 'Ladies' : 'Men'} · ${p}`));
  const changed = JSON.stringify(draft) !== JSON.stringify(current);

  const save = () => {
    if (problems.length) return Alert.alert('Check the scorecard', problems.slice(0, 4).map((p) => p.replace(/stroke indexes must be [^(]*\(got[^)]*\)/, 'hole handicaps must use each number once')).join('\n'));
    saveCourse(draft, current);
    track('course_edited', { fromPhoto });
    // The change is only for me, but the Clutch Up team is told what changed so the card can be reviewed.
    void reportCourseChange(current, draft, fromPhoto ? 'photo' : 'manual');
    void resendSharedCourse(draft); // friends I've shared it with get the new version
    router.back();
  };
  const reset = () =>
    Alert.alert('Go back to the original?', 'Your changes to this course will be removed. Rounds already played are not affected.', [
      { text: 'Cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          resetCourse(id, current);
          const o = originalCourse(id);
          if (o) setDraft(clone(o));
        },
      },
    ]);

  const head = (t: string, w?: number) => <Text style={{ width: w, flex: w ? undefined : 1, textAlign: 'center', color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>{t}</Text>;
  // Hole handicaps used twice (or out of range) are outlined in red.
  const siCount = new Map<number, number>();
  for (const h of tee?.holes ?? []) siCount.set(h.strokeIndex, (siCount.get(h.strokeIndex) ?? 0) + 1);
  const badSi = (si: number) => (siCount.get(si) ?? 0) > 1 || si < 1 || si > (tee?.holes.length ?? 18);
  const missing = Array.from({ length: tee?.holes.length ?? 0 }, (_, i) => i + 1).filter((n) => !siCount.has(n));
  /** Plain-English versions of the checks. */
  const friendly = (p: string) =>
    p.replace(`${tee?.name}: `, '').startsWith('stroke indexes')
      ? `Hole handicaps: each number from 1 to ${tee?.holes.length} must be used once.${missing.length ? ` Missing: ${missing.join(', ')}.` : ''}`
      : p.replace(`${tee?.name}: `, '').replace(/^\w/, (x) => x.toUpperCase());
  const nine = (from: number) => {
    const holes = tee.holes.slice(from, from + 9);
    return (
      <View>
        {holes.map((h, k) => {
          const i = from + k;
          return (
            <View key={h.number} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text style={{ width: 34, textAlign: 'center', color: c.text, fontWeight: '700', fontSize: 15 }}>{h.number}</Text>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Hole ${h.number} par down`} hitSlop={6} onPress={() => setHole(i, { par: Math.max(3, h.par - 1) })} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: c.primary, fontWeight: '800' }}>−</Text>
                </Pressable>
                <Text style={{ width: 22, textAlign: 'center', color: c.text, fontSize: 16, fontWeight: '700', fontFamily: fonts.serif }}>{h.par}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Hole ${h.number} par up`} hitSlop={6} onPress={() => setHole(i, { par: Math.min(6, h.par + 1) })} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: c.primary, fontWeight: '800' }}>+</Text>
                </Pressable>
              </View>
              <View style={{ width: 56, alignItems: 'center' }}>
                <NumField label={`Hole ${h.number} handicap`} value={h.strokeIndex} width={46} bad={badSi(h.strokeIndex)} onChange={(n) => setHole(i, { strokeIndex: n ?? 0 })} />
              </View>
              <View style={{ width: 66, alignItems: 'center' }}>
                <NumField label={`Hole ${h.number} yards`} value={h.yards} width={58} onChange={(n) => setHole(i, { yards: n })} />
              </View>
            </View>
          );
        })}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, backgroundColor: c.chip, borderTopWidth: 1, borderTopColor: c.border }}>
          <Text style={{ width: 34, textAlign: 'center', color: c.text, fontWeight: '800', fontSize: 11 }}>{from === 0 ? 'OUT' : 'IN'}</Text>
          <Text style={{ flex: 1, textAlign: 'center', color: c.text, fontWeight: '800' }}>{holes.reduce((s, h) => s + h.par, 0)}</Text>
          <View style={{ width: 56 }} />
          <Text style={{ width: 66, textAlign: 'center', color: c.muted, fontWeight: '700' }}>{holes.reduce((s, h) => s + (h.yards ?? 0), 0) || ''}</Text>
        </View>
      </View>
    );
  };

  const teeProblems = tee ? validateTee(tee) : [];
  return (
    <>
      <Stack.Screen options={{ title: draft.name.split(' – ')[1] ?? draft.name.replace(/ (Golf )?(& )?Country Club$/, '') }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 80 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <View>
          <Text style={{ fontFamily: fonts.serif, fontSize: 22, fontWeight: '700', color: c.text }}>{draft.name}</Text>
          <Text style={{ color: c.muted }}>
            {[draft.city, draft.region].filter(Boolean).join(', ')}
            {sharedWithMe && !myCopy ? ` · shared by ${sharedWithMe.fromName ?? 'a friend'}` : added ? ' · added by you' : edited ? ' · edited' : ''}
          </Text>
        </View>
        {sharedWithMe && !myCopy && (
          <Text style={{ color: c.muted, fontSize: 13 }}>Changes you save here are just for you.</Text>
        )}
        {scanned && (
          <View style={{ backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.md, gap: 4, borderLeftWidth: 3, borderLeftColor: c.accent }}>
            <Text style={{ color: c.text, fontWeight: '700' }}>Read from your photo: {draft.tees.length} tee{draft.tees.length === 1 ? '' : 's'}</Text>
            <Text style={{ color: c.text, fontSize: 14 }}>Check each tee against the card. Anything that couldn’t be read is outlined in red.</Text>
            {notes ? <Text style={{ color: c.muted, fontSize: 13, fontStyle: 'italic' }}>{notes}</Text> : null}
          </View>
        )}

        <Card style={{ gap: space.sm }}>
          <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>Update from a scorecard photo</Text>
          <Text style={{ color: c.muted, fontSize: 13 }}>Take or choose a photo of the card. Ratings, slopes, pars, hole handicaps and yards are filled in for you to check.</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}><Button small kind="secondary" title="📷 Take photo" disabled={scanBusy} onPress={() => void updateFromPhoto('camera')} /></View>
            <View style={{ flex: 1 }}><Button small kind="secondary" title="🖼️ Choose photo" disabled={scanBusy} onPress={() => void updateFromPhoto('library')} /></View>
          </View>
          {scanBusy ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}><ActivityIndicator color={c.primary} /><Text style={{ color: c.muted }}>Reading the scorecard…</Text></View> : null}
          {scanMsg ? <Text style={{ color: scanMsg.bad ? c.danger : c.text, fontSize: 13 }}>{scanMsg.text}</Text> : null}
        </Card>

        {(
          <Segmented options={genders.map((g) => ({ value: g, label: g === 'M' ? 'Men’s tees' : 'Ladies’ tees' }))} value={gender} onChange={(g) => { setGender(g); setTeeId(null); }} />
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {tees.map((t) => {
            const sel = t.id === tee.id;
            const bad = validateTee(t).length > 0;
            return (
              <Pressable key={t.id} onPress={() => setTeeId(t.id)} accessibilityRole="tab" accessibilityState={{ selected: sel }}
                style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: bad ? c.danger : sel ? c.primary : c.border, backgroundColor: sel ? c.primary : c.card }}>
                <Text style={{ color: sel ? c.onPrimary : c.text, fontWeight: '700' }}>{t.name}{isCustom(t) ? ' ·new' : ''}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => { setCopyFrom(tee?.id ?? null); setAdding(true); }}
            accessibilityRole="button"
            accessibilityLabel="Add a tee"
            style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.primary }}>
            <Text style={{ color: c.primary, fontWeight: '700' }}>+ Add tee</Text>
          </Pressable>
        </ScrollView>

        {!tee && (
          <Card>
            <Body muted>No {gender === 'M' ? 'men’s' : 'ladies’'} tees yet. Tap “+ Add tee” to add one.</Body>
          </Card>
        )}
        {tee && <>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <H2>{tee.name} tees · {gender === 'M' ? 'Men' : 'Ladies'}</H2>
            {canRemove(tee) && (
              <Pressable onPress={removeTee} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove the ${tee.name} tee`}>
                <Text style={{ color: c.danger, fontWeight: '700' }}>Remove</Text>
              </Pressable>
            )}
          </View>
          {/* Three equal columns, one-line labels and boxes of one height, so they line up. */}
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Label>Rating</Label>
              <NumField label="Course rating" decimal tall value={tee.courseRating} width="100%" onChange={(n) => updateTee((t) => ({ ...t, courseRating: n ?? 0 }))} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Label>Slope</Label>
              <NumField label="Slope" tall value={tee.slope} width="100%" onChange={(n) => updateTee((t) => ({ ...t, slope: n ?? 0 }))} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Label>Par</Label>
              {/* Par is the holes added up, so it's shown, not typed. */}
              <View style={{ height: BOX_H, borderRadius: radius.sm, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18, fontFamily: fonts.serif, fontWeight: '700', color: c.text }}>{tee.par}</Text>
              </View>
            </View>
          </View>
        </Card>

        <Card>
          <H2>Holes</H2>
          <Text style={{ color: c.muted, fontSize: 12 }}>Hcp is the hole handicap (1 = hardest). Each number from 1 to 18 is used once.</Text>
          <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 4 }}>
            {head('HOLE', 34)}
            {head('PAR')}
            {head('HCP', 56)}
            {head('YARDS', 66)}
          </View>
          {nine(0)}
          {tee.holes.length > 9 && nine(9)}
          {teeProblems.length > 0 && (
            <View style={{ backgroundColor: '#FBEDEC', borderRadius: radius.md, padding: space.md, gap: 2 }}>
              {teeProblems.map((p) => <Text key={p} style={{ color: c.danger, fontSize: 13 }}>{friendly(p)}</Text>)}
            </View>
          )}
          {tees.length > 1 && (
            <Button small kind="secondary" title={`Copy these pars and hole handicaps to the other ${gender === 'M' ? 'men’s' : 'ladies’'} tees`} onPress={copyToOthers} />
          )}
        </Card>

        </>}

        <Button title={changed ? 'Save changes' : 'No changes yet'} disabled={!changed} onPress={save} />
        {canShare && (added || edited) && !(sharedWithMe && !myCopy) && (
          <Button
            title={sharedTo.length ? `Shared with ${sharedTo.length} friend${sharedTo.length === 1 ? '' : 's'} · change` : 'Share course with friends'}
            kind="secondary"
            onPress={() => setSharing(true)}
          />
        )}
        {edited && !added && <Button title="Reset to the original scorecard" kind="ghost" onPress={reset} />}
        {added && (
          <Button
            title="Delete this course"
            kind="ghost"
            onPress={() =>
              Alert.alert(`Delete ${draft.name}?`, 'Rounds already played there are kept.', [
                { text: 'Cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => { deleteCourse(id); router.back(); } },
              ])
            }
          />
        )}
        <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>New rounds use your changes. Rounds already played keep the numbers they were played with.</Text>
      </ScrollView>

      <ShareCourseSheet course={current} visible={sharing} onClose={() => setSharing(false)} />

      <Sheet visible={adding} onClose={() => setAdding(false)} title={`New ${gender === 'M' ? 'men’s' : 'ladies’'} tee`}>
        <View style={{ gap: space.md }}>
          <Field label="Tee name" value={newName} onChangeText={setNewName} placeholder="Black" autoFocus />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Label>Rating</Label>
              <NumField label="New tee course rating" decimal tall value={newRating} width="100%" onChange={setNewRating} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Label>Slope</Label>
              <NumField label="New tee slope" tall value={newSlope} width="100%" onChange={setNewSlope} />
            </View>
          </View>
          {tees.length > 0 && (
            <View style={{ gap: 6 }}>
              <Label>Copy pars, hole handicaps and yards from</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {tees.map((t) => {
                  const on = (copyFrom ?? tees[0].id) === t.id;
                  return (
                    <Pressable key={t.id} onPress={() => setCopyFrom(t.id)} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: on ? c.primary : c.chip }}>
                      <Text style={{ color: on ? c.onPrimary : c.text, fontWeight: '700' }}>{t.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ color: c.muted, fontSize: 12 }}>You can change any hole after adding the tee.</Text>
            </View>
          )}
          {newName ? <Text style={{ color: addProblem ? c.danger : c.muted, fontSize: 13 }}>{addProblem ?? 'Ready to add.'}</Text> : null}
          <Button title="Add tee" disabled={!!addProblem} onPress={addTee} />
        </View>
      </Sheet>
    </>
  );
}
