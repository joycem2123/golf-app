import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { fonts, useColors } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const c = useColors();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider value={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: c.bg, card: c.card, primary: c.primary, text: c.text, border: c.border } }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.card },
          headerTintColor: c.primary,
          headerTitleStyle: { color: c.primary, fontFamily: fonts.serif, fontWeight: '700' },
          headerLargeTitleStyle: { color: c.primary, fontFamily: fonts.serif },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.bg },
        }}>
        <Stack.Screen name="index" options={{ title: 'Matchday', headerLargeTitle: true }} />
        <Stack.Screen name="new-round" options={{ title: 'New Round', presentation: 'modal' }} />
        <Stack.Screen name="players" options={{ title: 'Players' }} />
        <Stack.Screen name="new-event" options={{ title: 'New Event', presentation: 'modal' }} />
        <Stack.Screen name="event/[id]/index" options={{ title: 'Event' }} />
        <Stack.Screen name="head-to-head" options={{ title: 'Head to Head' }} />
        <Stack.Screen name="round/[id]/index" options={{ title: 'Scorecard' }} />
        <Stack.Screen name="round/[id]/results" options={{ title: 'Results' }} />
      </Stack>
    </ThemeProvider>
  );
}
