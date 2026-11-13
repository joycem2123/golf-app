import { Outfit_600SemiBold, Outfit_700Bold, useFonts } from '@expo-google-fonts/outfit';
import { DefaultTheme, Redirect, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useUsageTracking } from '@/lib/usage';
import { installCrashGuard } from '@/lib/crash-guard';
import { useLiveActivity } from '@/lib/live-activity';
import { useProStatus } from '@/lib/pro';
import { TutorialPlayer } from '@/components/tutorial-player';
import { WelcomeVideo } from '@/components/welcome-video';
import { SyncProvider } from '@/sync/sync-provider';
import { fonts, useColors } from '@/theme';

export { ErrorBoundary } from '@/components/error-screen';

SplashScreen.preventAutoHideAsync();
installCrashGuard();

/** The website copy at clutchupgolf.com/tv/ is only the TV board (set when that copy is built). */
const TV_ONLY = process.env.EXPO_PUBLIC_TV_ONLY === '1';

export default function RootLayout() {
  const c = useColors();
  // The wordmark font; keep the splash screen up until it's ready (or failed, then fall back).
  const [fontsLoaded, fontError] = useFonts({ Outfit_600SemiBold, Outfit_700Bold });
  const ready = fontsLoaded || !!fontError;
  const pathname = usePathname();
  useUsageTracking(pathname);
  useLiveActivity();
  useProStatus();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  // The TV board's website: nothing but the board (no sign-in, no syncing, no tours).
  if (TV_ONLY && !pathname.startsWith('/board')) return <Redirect href="/board" />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
        <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="new-round" options={{ title: 'New Round', presentation: 'modal' }} />
        <Stack.Screen name="upload-scorecard" options={{ title: 'Upload Scorecard' }} />
        <Stack.Screen name="players" options={{ title: 'Me & Friends' }} />
        <Stack.Screen name="add-friend" options={{ title: 'Add a Friend', presentation: 'modal' }} />
        <Stack.Screen name="new-event" options={{ title: 'New Event', presentation: 'modal' }} />
        <Stack.Screen name="event/[id]/index" options={{ title: 'Event' }} />
        <Stack.Screen name="event/[id]/match" options={{ title: 'Schedule a match', presentation: 'modal' }} />
        <Stack.Screen name="round/[id]/players" options={{ title: 'Change a player', presentation: 'modal' }} />
        <Stack.Screen name="round/[id]/teams" options={{ title: 'Edit teams', presentation: 'modal' }} />
        <Stack.Screen name="round/[id]/upload-card" options={{ title: 'Upload scorecard', presentation: 'modal' }} />
        <Stack.Screen name="event/[id]/add-round" options={{ title: 'Add round to event', presentation: 'modal' }} />
        <Stack.Screen name="event/[id]/edit" options={{ title: 'Edit event', presentation: 'modal' }} />
        <Stack.Screen name="event/[id]/fedex-round" options={{ title: "Round" }} />
        <Stack.Screen name="event/[id]/fedex-player" options={{ title: "Player" }} />
        <Stack.Screen name="event/[id]/match-players" options={{ title: "Match Players", presentation: "modal" }} />
        <Stack.Screen name="event/[id]/summary" options={{ title: "Final Results", presentation: "modal" }} />
        <Stack.Screen name="event/[id]/expense" options={{ title: "Add Expense", presentation: "modal" }} />
        <Stack.Screen name="head-to-head" options={{ title: 'Head to Head' }} />
        <Stack.Screen name="join" options={{ title: 'Join with Code', presentation: 'modal' }} />
        <Stack.Screen name="pro" options={{ title: 'Clutch Up Pro', presentation: 'modal' }} />
        <Stack.Screen name="board" options={{ headerShown: false, title: 'Clutch Up TV' }} />
        <Stack.Screen name="round/[id]/index" options={{ title: 'Scorecard' }} />
        <Stack.Screen name="round/[id]/results" options={{ title: 'Results' }} />
        <Stack.Screen name="round/[id]/match/[gi]" options={{ title: "Match" }} />
        <Stack.Screen name="courses" options={{ title: "Courses" }} />
        <Stack.Screen name="account" options={{ title: "Account Settings" }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="course/[id]" options={{ title: "Course" }} />
        <Stack.Screen name="course/new" options={{ title: "Add a course", presentation: "modal" }} />
      </Stack>
      {!TV_ONLY && <SyncProvider />}
    </ThemeProvider>
    {!TV_ONLY && <WelcomeVideo onHome={pathname === '/'} />}
    {!TV_ONLY && <TutorialPlayer />}
    </GestureHandlerRootView>
  );
}
