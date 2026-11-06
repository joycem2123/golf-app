import { validateTee, type Course, type Tee } from '@golf/engine';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Body, Button, Card, H2, Label, Segmented } from '@/components/ui';
import { getCourse, originalCourse } from '@/lib/courses';
import { useStore } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';

/** A number box that lets you type freely ("70." on the way to "70.6") and reports valid numbers. */
function NumField({ value, onChange, decimal, width, label, bad }: { value: number | undefined; onChange: (n: number | undefined) => void; decimal?: boolean; width: number; label: string; bad?: boolean }) {
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
      style={{ width, textAlign: 'center', fontSize: 15, color: c.text, paddingVertical: 6, borderWidth: bad ? 2 : 1, borderColor: bad ? c.danger : c.border, borderRadius: radius.sm, backgroundColor: bad ? '#FBEDEC' : c.card }}
    />
  );
}

const clone = (co: Course): Course => JSON.parse(JSON.stringify(co));

export default function CourseEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const saveCourse = useStore((s) => s.saveCourse);
  const resetCourse = useStore((s) => s.resetCourse);
  const edited = useStore((s) => !!s.courseEdits?.[id]);
  const current = getCourse(id);
  const [draft, setDraft] = useState<Course | null>(() => (current ? clone(current) : null));
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [teeId, setTeeId] = useState<string | null>(null);
  if (!current || !draft) return <Body>Course not found.</Body>;

  const tees = draft.tees.filter((t) => (t.gender ?? 'M') === gender);
  const tee = tees.find((t) => t.id === teeId) ?? tees[0];
  const genders = (['M', 'F'] as const).filter((g) => draft.tees.some((t) => (t.gender ?? 'M') === g));

  const updateTee = (fn: (t: Tee) => Tee) => setDraft((d) => (d ? { ...d, tees: d.tees.map((t) => (t.id === tee.id ? fn(t) : t)) } : d));
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

  const problems = draft.tees.flatMap((t) => validateTee(t).map((p) => `${t.gender === 'F' ? 'Ladies' : 'Men'} · ${p}`));
  const changed = JSON.stringify(draft) !== JSON.stringify(current);

  const save = () => {
    if (problems.length) return Alert.alert('Check the scorecard', problems.slice(0, 4).map((p) => p.replace(/stroke indexes must be [^(]*\(got[^)]*\)/, 'hole handicaps must use each number once')).join('\n'));
    saveCourse(draft, current);
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
  for (const h of tee.holes) siCount.set(h.strokeIndex, (siCount.get(h.strokeIndex) ?? 0) + 1);
  const badSi = (si: number) => (siCount.get(si) ?? 0) > 1 || si < 1 || si > tee.holes.length;
  const missing = Array.from({ length: tee.holes.length }, (_, i) => i + 1).filter((n) => !siCount.has(n));
  /** Plain-English versions of the checks. */
  const friendly = (p: string) =>
    p.replace(`${tee.name}: `, '').startsWith('stroke indexes')
      ? `Hole handicaps: each number from 1 to ${tee.holes.length} must be used once.${missing.length ? ` Missing: ${missing.join(', ')}.` : ''}`
      : p.replace(`${tee.name}: `, '').replace(/^\w/, (x) => x.toUpperCase());
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

  const teeProblems = validateTee(tee);
  return (
    <>
      <Stack.Screen options={{ title: draft.name.split(' – ')[1] ?? draft.name.replace(/ (Golf )?(& )?Country Club$/, '') }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 80 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <View>
          <Text style={{ fontFamily: fonts.serif, fontSize: 22, fontWeight: '700', color: c.text }}>{draft.name}</Text>
          <Text style={{ color: c.muted }}>{[draft.city, draft.region].filter(Boolean).join(', ')}{edited ? ' · edited' : ''}</Text>
        </View>

        {genders.length > 1 && (
          <Segmented options={genders.map((g) => ({ value: g, label: g === 'M' ? 'Men’s tees' : 'Ladies’ tees' }))} value={gender} onChange={(g) => { setGender(g); setTeeId(null); }} />
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {tees.map((t) => {
            const sel = t.id === tee.id;
            const bad = validateTee(t).length > 0;
            return (
              <Pressable key={t.id} onPress={() => setTeeId(t.id)} accessibilityRole="tab" accessibilityState={{ selected: sel }}
                style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: bad ? c.danger : sel ? c.primary : c.border, backgroundColor: sel ? c.primary : c.card }}>
                <Text style={{ color: sel ? c.onPrimary : c.text, fontWeight: '700' }}>{t.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Card>
          <H2>{tee.name} tees · {gender === 'M' ? 'Men' : 'Ladies'}</H2>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Label>Course rating</Label>
              <NumField label="Course rating" decimal value={tee.courseRating} width={100} onChange={(n) => updateTee((t) => ({ ...t, courseRating: n ?? 0 }))} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Label>Slope</Label>
              <NumField label="Slope" value={tee.slope} width={100} onChange={(n) => updateTee((t) => ({ ...t, slope: n ?? 0 }))} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Label>Par</Label>
              <Text style={{ fontSize: 20, fontFamily: fonts.serif, fontWeight: '700', color: c.text, paddingVertical: 4 }}>{tee.par}</Text>
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

        <Button title={changed ? 'Save changes' : 'No changes yet'} disabled={!changed} onPress={save} />
        {edited && <Button title="Reset to the original scorecard" kind="ghost" onPress={reset} />}
        <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>New rounds use your changes. Rounds already played keep the numbers they were played with.</Text>
      </ScrollView>
    </>
  );
}
