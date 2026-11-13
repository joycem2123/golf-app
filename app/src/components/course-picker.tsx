/**
 * New Round → Course. With nothing typed: my Favourites (starred courses), then Previously played (courses from my
 * rounds, latest first). Typing searches every course I have, plus the online course database. Each course has a
 * star to keep it in Favourites, and "Edit card" to fix my own copy of its scorecard (only on my phone).
 */
import { searchCourses, validateCourse, type Course } from '@golf/engine';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { OnlineCourses } from '@/components/online-courses';
import { Star } from '@/components/star';
import { Body, Label } from '@/components/ui';
import { useStore } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';

function CourseRow({ co, selected, onPick }: { co: Course; selected: boolean; onPick: (c: Course) => void }) {
  const c = useColors();
  const fav = useStore((s) => (s.favouriteCourses ?? []).includes(co.id));
  const toggle = useStore((s) => s.toggleFavouriteCourse);
  const unfinished = validateCourse(co).length > 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: radius.lg, borderWidth: selected ? 2 : 1, borderColor: selected ? c.primary : c.border, paddingLeft: space.md, paddingRight: 4, paddingVertical: space.sm }}>
      <Pressable onPress={() => onPick(co)} disabled={unfinished} accessibilityRole="button" accessibilityLabel={`Play ${co.name}`}
        style={({ pressed }) => ({ flex: 1, gap: 2, opacity: unfinished ? 0.55 : pressed ? 0.6 : 1 })}>
        <Text style={{ color: c.text, fontFamily: fonts.serif, fontWeight: '700', fontSize: 17 }}>{co.name}</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>{[[co.city, co.region].filter(Boolean).join(', '), `Par ${co.tees[0]?.par ?? '–'}`, `${co.tees.length} tees`].filter(Boolean).join(' · ')}</Text>
        {unfinished ? <Text style={{ color: c.danger, fontSize: 12 }}>Its card is missing something. Tap Edit card to finish it.</Text> : null}
      </Pressable>
      <View style={{ alignItems: 'center' }}>
        <Star on={fav} onPress={() => toggle(co.id)} label={fav ? `Remove ${co.name} from favourites` : `Add ${co.name} to favourites`} />
        <Pressable onPress={() => router.push({ pathname: '/course/[id]', params: { id: co.id } })} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Edit the scorecard for ${co.name}`}>
          <Text style={{ color: c.primary, fontSize: 11, fontWeight: '700' }}>Edit card</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function CoursePicker({ query, courses, selectedId, onPick }: { query: string; courses: Course[]; selectedId?: string; onPick: (c: Course) => void }) {
  const favIds = useStore((s) => s.favouriteCourses ?? []);
  const rounds = useStore((s) => s.rounds);
  const toggle = useStore((s) => s.toggleFavouriteCourse);
  const byId = new Map(courses.map((co) => [co.id, co]));
  const q = query.trim();

  if (q) {
    const found = searchCourses(q, courses);
    return (
      <View style={{ gap: space.sm }}>
        {found.map((co) => <CourseRow key={co.id} co={co} selected={co.id === selectedId} onPick={onPick} />)}
        {/* Not in the app yet: matching courses from the online course database. */}
        <OnlineCourses query={query} have={courses} onPick={onPick} onStar={(co) => { if (!useStore.getState().favouriteCourses?.includes(co.id)) toggle(co.id); }} />
      </View>
    );
  }

  const favs = favIds.map((id) => byId.get(id)).filter((co): co is Course => !!co);
  const seen = new Set(favIds);
  const played: Course[] = [];
  for (const r of [...rounds].sort((a, b) => b.createdAt - a.createdAt)) {
    if (seen.has(r.courseId)) continue;
    seen.add(r.courseId);
    const co = byId.get(r.courseId);
    if (co) played.push(co);
  }
  return (
    <View style={{ gap: space.sm }}>
      <Label>Favourites</Label>
      {favs.length ? favs.map((co) => <CourseRow key={co.id} co={co} selected={co.id === selectedId} onPick={onPick} />) : <Body muted>Search for a course and tap ☆ to keep it here.</Body>}
      <Label style={{ marginTop: space.sm }}>Previously played</Label>
      {played.length ? played.map((co) => <CourseRow key={co.id} co={co} selected={co.id === selectedId} onPick={onPick} />) : <Body muted>Courses you play will show here.</Body>}
    </View>
  );
}
