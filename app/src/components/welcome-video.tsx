/**
 * First time on Home (after sign-in or "Continue as guest"): offer the video tour once.
 * Shown once per phone; either button means it's never shown again.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';

import { openTutorial } from '@/lib/tutorial';
import { track } from '@/lib/usage';
import { fonts, radius, space, useColors } from '@/theme';

const KEY = 'tutorial:offered';

export function WelcomeVideo() {
  const c = useColors();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      AsyncStorage.getItem(KEY)
        .then((v) => {
          if (cancelled || v) return;
          setOpen(true);
          track('tutorial_offered');
        })
        .catch(() => undefined);
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  const close = (play: boolean) => {
    setOpen(false);
    void AsyncStorage.setItem(KEY, new Date().toISOString()).catch(() => undefined);
    if (play) void openTutorial('welcome');
    else track('tutorial_skipped');
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => close(false)} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
        <View style={{ width: '100%', maxWidth: 360, backgroundColor: c.brand, borderRadius: radius.lg + 6, overflow: 'hidden', borderWidth: 1.5, borderColor: c.brandGold }}>
          {/* Video preview: tap it to play too. */}
          <Pressable onPress={() => close(true)} accessibilityRole="button" accessibilityLabel="Play the tutorial">
            <View>
              <View style={{ width: '100%', aspectRatio: 1, backgroundColor: '#14352A', overflow: 'hidden' }}>
                <Image source={require('../../assets/images/tutorial-poster.jpg')} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} resizeMode="cover" />
              </View>
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
    </Modal>
  );
}
