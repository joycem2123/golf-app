import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { TabHeader } from '@/components/tab-header';
import { Body, Card, Label } from '@/components/ui';
import { SEED_COURSES } from '@golf/engine';
import { space, useColors } from '@/theme';

function Row({ title, sub, href }: { title: string; sub: string; href: Href }) {
  const c = useColors();
  return (
    <Pressable onPress={() => router.push(href)}>
      {({ pressed }) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: c.text, fontWeight: '600' }}>{title}</Text>
            <Text style={{ fontSize: 13, color: c.muted }}>{sub}</Text>
          </View>
          <Text style={{ color: c.muted, fontSize: 20 }}>›</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function More() {
  return (
    <View style={{ flex: 1 }}>
      <TabHeader title="More" />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }}>
        <Card style={{ paddingVertical: 0 }}>
          <Row title="Players" sub="Your group and their handicap indexes" href="/players" />
          <Row title="New event" sub="Trip, Ryder Cup or season" href="/new-event" />
          <Row title="Join with code" sub="Follow a leaderboard or keep score" href="/join" />
          <Row title="Head to head" sub="Records between any two players" href="/head-to-head" />
        </Card>
        <Label>Courses</Label>
        <Card>
          {SEED_COURSES.map((c) => (
            <Body key={c.id}>{c.name}</Body>
          ))}
          <Body muted>More Canadian and US courses are coming.</Body>
        </Card>
        <Body muted style={{ textAlign: 'center' }}>MatchDay · preview build</Body>
      </ScrollView>
    </View>
  );
}
