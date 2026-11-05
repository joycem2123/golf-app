import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { useColors } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = useColors();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.primary,
          headerTitleStyle: { color: c.text },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.bg },
        }}>
        <Stack.Screen name="index" options={{ title: 'Matchday', headerLargeTitle: true }} />
        <Stack.Screen name="new-round" options={{ title: 'New Round', presentation: 'modal' }} />
        <Stack.Screen name="players" options={{ title: 'Players' }} />
        <Stack.Screen name="round/[id]/index" options={{ title: 'Scorecard' }} />
        <Stack.Screen name="round/[id]/results" options={{ title: 'Results' }} />
      </Stack>
    </ThemeProvider>
  );
}
