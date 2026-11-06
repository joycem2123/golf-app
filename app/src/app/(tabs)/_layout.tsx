import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Platform, Text, type ColorValue } from 'react-native';

import { useStore } from '@/store/store';
import { useFriendRequests } from '@/sync/friends';
import { useColors } from '@/theme';

function TabIcon({ ios, glyph, color }: { ios: SymbolViewProps['name']; glyph: string; color: ColorValue }) {
  if (Platform.OS === 'ios') return <SymbolView name={ios} tintColor={color} size={24} />;
  return <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const c = useColors();
  const onboarded = useStore((s) => s.onboarded);
  const requests = useFriendRequests((s) => s.incoming.length);
  // Wait until saved data has loaded before deciding whether to show the welcome screen.
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated());
  useEffect(() => useStore.persist.onFinishHydration(() => setHydrated(true)), []);
  if (!hydrated) return null;
  if (!onboarded) return <Redirect href="/welcome" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <TabIcon ios="house.fill" glyph="⌂" color={color} /> }} />
      <Tabs.Screen name="scores" options={{ title: 'Scores', tabBarIcon: ({ color }) => <TabIcon ios="list.number" glyph="≡" color={color} /> }} />
      <Tabs.Screen name="friends" options={{ title: 'Friends', tabBarBadge: requests || undefined, tabBarBadgeStyle: { backgroundColor: c.under }, tabBarIcon: ({ color }) => <TabIcon ios="person.2.fill" glyph="☺" color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabIcon ios="person.crop.circle" glyph="◉" color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color }) => <TabIcon ios="ellipsis.circle" glyph="⋯" color={color} /> }} />
    </Tabs>
  );
}
