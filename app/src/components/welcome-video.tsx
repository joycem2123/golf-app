/**
 * First time on Home (after sign-in or "Continue as guest"): offer the video tutorial once.
 * Shown once per account; either button means it's not shown again for that account.
 * Drawn as a layer over the app (not a separate window), so it can't get stuck on top.
 */
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTutorialPlayer } from '@/components/tutorial-player';
import { openTutorial } from '@/lib/tutorial';
import { track } from '@/lib/usage';
import { useStore } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';


/** Shown over Home only; `onHome` comes from the root layout. */
export function WelcomeVideo({ onHome }: { onHome: boolean }) {
  const c = useColors();
  const onboarded = useStore((s) => s.onboarded);
  const offered = useStore((s) => s.tutorialOffered);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!onHome || !onboarded) return;
    let cancelled = false;
    let shown = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    Promise.resolve(useStore.getState().tutorialOffered)
      .then((v) => {
        if (cancelled || v) return;
        useTutorialPlayer.setState({ welcome: true }); // tips wait while this is up
        t = setTimeout(() => {
          if (cancelled) return;
          shown = true;
          setOpen(true);
          track('tutorial_offered');
        }, 600);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (t) clearTimeout(t);
      // Left Home before the card appeared: let tips carry on. (Once shown, closing it clears the flag.)
      if (!shown) useTutorialPlayer.setState({ welcome: false });
    };
  }, [onHome, onboarded, offered]);

  const close = (play: boolean) => {
    setOpen(false);
    useStore.setState({ tutorialOffered: true });
    if (play) openTutorial('welcome');
    else track('tutorial_skipped');
    useTutorialPlayer.setState({ welcome: false });
  };

  if (!open || !onHome) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 900, elevation: 900, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: space.xl }]}>
      <View style={{ width: '100%', maxWidth: 360, backgroundColor: c.brand, borderRadius: radius.lg + 6, overflow: 'hidden', borderWidth: 1.5, borderColor: c.brandGold }}>
        {/* Video preview: tap it to play too. */}
        <Pressable onPress={() => close(true)} accessibilityRole="button" accessibilityLabel="Play the tutorial">
          <View style={{ width: '100%', aspectRatio: 1, backgroundColor: '#14352A', overflow: 'hidden' }}>
            <Image source={require('../../assets/images/tutorial-poster.jpg')} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} resizeMode="cover" />
            <View style={{ position: 'absolute', top: 12, right: 12 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.brandGold, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10 }}>
                <Text style={{ color: c.brand, fontSize: 20, marginLeft: 3 }}>▶</Text>
              </View>
            </View>
          </View>
        </Pressable>
        <View style={{ padding: space.lg, gap: space.sm }}>
          <Text style={{ color: '#fff', fontFamily: fonts.brand, fontSize: 24, textAlign: 'center' }}>Welcome to Clutch Up!</Text>
          <Text style={{ color: '#ffffffcc', fontSize: 15, textAlign: 'center', lineHeight: 21 }}>
            New here? Watch a 2-minute tutorial on scoring, games, uploading a scorecard and events.
          </Text>
          <Pressable
            onPress={() => close(true)}
            accessibilityRole="button"
            style={({ pressed }) => ({ backgroundColor: c.brandGold, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: space.sm, opacity: pressed ? 0.8 : 1 })}>
            <Text style={{ color: c.brand, fontWeight: '800', fontSize: 16 }}>▶  Play the tutorial</Text>
          </Pressable>
          <Pressable onPress={() => close(false)} accessibilityRole="button" hitSlop={8} style={{ paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: '#ffffffcc', fontWeight: '600', fontSize: 15 }}>Skip for now</Text>
          </Pressable>
          <Text style={{ color: '#ffffff88', fontSize: 12, textAlign: 'center' }}>You can watch it any time in More → How Clutch Up works.</Text>
        </View>
      </View>
    </View>
  );
}
