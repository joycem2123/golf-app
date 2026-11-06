import type { Course } from '@golf/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Body, Button, Card, Field, H2, Segmented } from '@/components/ui';
import { pickScorecard, readScorecard } from '@/lib/scan';
import { useStore } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';

/** Add a course: type its name, then scan the scorecard or enter it by hand. */
export default function NewCourse() {
  const c = useColors();
  const saveCourse = useStore((s) => s.saveCourse);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [holes, setHoles] = useState<'18' | '9'>('18');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const id = () => `custom-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${Date.now().toString(36)}`;
  const open = (course: Course, notes?: string) => {
    saveCourse(course, course);
    router.replace({ pathname: '/course/[id]', params: { id: course.id, ...(notes !== undefined ? { scanned: '1', notes } : {}) } });
  };

  const scan = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const photo = await pickScorecard(source);
      if (!photo) return;
      setBusy('Reading the scorecard… this takes about 20 seconds.');
      const { course, notes } = await readScorecard(photo, { id: id(), name: name.trim(), city: city.trim() || undefined, region: region.trim() || undefined });
      open(course, notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const manual = () => {
    const n = Number(holes);
    const course: Course = {
      id: id(),
      name: name.trim(),
      city: city.trim() || undefined,
      region: region.trim() || undefined,
      country: 'CA',
      source: 'entered by hand',
      tees: [
        {
          id: `${Date.now().toString(36)}-white-m`,
          name: 'White',
          gender: 'M',
          courseRating: 0,
          slope: 0,
          par: n * 4,
          holes: Array.from({ length: n }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 })),
        },
      ],
    };
    open(course);
  };

  const option = (icon: string, title: string, sub: string, onPress: () => void) => (
    <Pressable onPress={onPress} disabled={!!busy || !name.trim()} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, opacity: !name.trim() || busy ? 0.5 : pressed ? 0.7 : 1 })}>
      <Text style={{ fontSize: 26, width: 34, textAlign: 'center' }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.serif, fontSize: 17, fontWeight: '700', color: c.text }}>{title}</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>{sub}</Text>
      </View>
      <Text style={{ color: c.muted, fontSize: 20 }}>›</Text>
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
      <Card>
        <H2>Course</H2>
        <Field label="Course name" value={name} onChangeText={setName} placeholder="e.g. Canyon Meadows Golf & Country Club" />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Field label="City" value={city} onChangeText={setCity} placeholder="Calgary" />
          <View style={{ width: 110 }}>
            <Field label="Prov / State" value={region} onChangeText={setRegion} placeholder="AB" autoCapitalize="characters" maxLength={3} />
          </View>
        </View>
      </Card>

      <Text style={{ color: c.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 }}>FILL IN THE SCORECARD</Text>
      {option('📷', 'Scan the scorecard', 'Take a photo. Every tee’s rating, slope, pars, hole handicaps and yards are filled in for you to check.', () => scan('camera'))}
      {option('🖼️', 'Use a photo of the scorecard', 'Choose a photo you already took, or a screenshot from the club’s website.', () => scan('library'))}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: fonts.serif, fontSize: 17, fontWeight: '700', color: c.text }}>✏️  Enter it myself</Text>
          <View style={{ width: 120 }}>
            <Segmented options={[{ value: '18', label: '18' }, { value: '9', label: '9' }]} value={holes} onChange={setHoles} />
          </View>
        </View>
        <Text style={{ color: c.muted, fontSize: 13 }}>Starts with one tee; add the others with “+ Add tee”.</Text>
        <Button title="Start entering holes" kind="secondary" disabled={!name.trim() || !!busy} onPress={manual} />
      </Card>

      {!name.trim() && <Body muted style={{ textAlign: 'center' }}>Type the course name first.</Body>}
      {busy && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'center', padding: space.md }}>
          <ActivityIndicator color={c.primary} />
          <Text style={{ color: c.text }}>{busy}</Text>
        </View>
      )}
      {error && (
        <View style={{ backgroundColor: '#FBEDEC', borderRadius: radius.md, padding: space.md }}>
          <Text style={{ color: c.danger }}>{error}</Text>
        </View>
      )}
      <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>Tip: lay the card flat in good light and fit the whole thing in the photo.</Text>
    </ScrollView>
  );
}
