import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Body, Button, Card } from '@/components/ui';
import { useCourses } from '@/lib/courses';
import { useStore } from '@/store/store';
import { radius, space, useColors } from '@/theme';

/** Every course in the app; tap one to correct its ratings, slopes, pars and hole handicaps. */
export default function Courses() {
  const c = useColors();
  const courses = useCourses();
  const edits = useStore((s) => s.courseEdits);
  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}>
      <Button title="+ Add a course" onPress={() => router.push('/course/new')} />
      <Body muted>Check each course against its scorecard. Changes apply to new rounds; rounds already played keep the numbers they were played with.</Body>
      <Card style={{ paddingVertical: 0 }}>
        {courses.map((co, i) => {
          const men = co.tees.filter((t) => (t.gender ?? 'M') === 'M').length;
          const ladies = co.tees.filter((t) => t.gender === 'F').length;
          return (
            <Pressable key={co.id} onPress={() => router.push({ pathname: '/course/[id]', params: { id: co.id } })} accessibilityRole="button" accessibilityLabel={`Edit ${co.name}`}>
              {({ pressed }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: c.border, opacity: pressed ? 0.6 : 1 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, color: c.text, fontWeight: '600' }}>{co.name}</Text>
                    <Text style={{ fontSize: 13, color: c.muted }}>
                      {[co.city, co.region].filter(Boolean).join(', ')} · {men} men’s tee{men === 1 ? '' : 's'} · {ladies} ladies’ tee{ladies === 1 ? '' : 's'}
                    </Text>
                  </View>
                  {edits?.[co.id] && (
                    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: c.accent }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>EDITED</Text>
                    </View>
                  )}
                  <Text style={{ color: c.muted, fontSize: 20 }}>›</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </Card>
    </ScrollView>
  );
}
