/**
 * One-time pop-up tips: a small card that slides up the first time you reach a screen.
 * Each tip shows once per phone; "Show tips again" in More brings them back.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { track } from '@/lib/usage';
import { radius, space, useColors } from '@/theme';

const KEY = 'tips:seen';
let seen: Set<string> | null = null;
let loading: Promise<Set<string>> | null = null;
let showing: string | null = null; // only one tip on screen at a time

const loadSeen = () =>
  (loading ??= AsyncStorage.getItem(KEY)
    .then((v) => (seen = new Set(v ? (JSON.parse(v) as string[]) : [])))
    .catch(() => (seen = new Set())));

const markSeen = (id: string) => {
  seen?.add(id);
  void AsyncStorage.setItem(KEY, JSON.stringify([...(seen ?? [])])).catch(() => undefined);
};

/** Bring every tip back (More → Show tips again). */
export async function resetTips() {
  seen = new Set();
  loading = Promise.resolve(seen);
  await AsyncStorage.removeItem(KEY).catch(() => undefined);
}

export function Tip({
  id,
  title,
  lines,
  when = true,
  tabScreen,
}: {
  id: string;
  title: string;
  lines: string[];
  /** Only show once this is true (e.g. there's a round to swipe). */
  when?: boolean;
  /** On a tab screen the tab bar already sits below, so less bottom space is needed. */
  tabScreen?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!when) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void loadSeen().then((s) => {
        if (cancelled || s.has(id) || (showing && showing !== id)) return;
        showing = id;
        setVisible(true);
        track('tip_shown', { tip: id });
        Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
      });
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
      if (showing === id) showing = null;
    };
  }, [id, when, anim]);

  if (!visible) return null;
  const close = () => {
    markSeen(id);
    track('tip_dismissed', { tip: id });
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setVisible(false);
      if (showing === id) showing = null;
    });
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: space.md,
        right: space.md,
        bottom: (tabScreen ? 0 : insets.bottom) + space.md,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
      }}>
      <View
        accessibilityRole="alert"
        style={{
          backgroundColor: c.brand,
          borderRadius: radius.lg,
          padding: space.lg,
          gap: space.sm,
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 8,
          borderLeftWidth: 4,
          borderLeftColor: c.brandGold,
        }}>
        <Text style={{ color: c.brandGold, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>TIP</Text>
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{title}</Text>
        {lines.map((l) => (
          <Text key={l} style={{ color: '#ffffffdd', fontSize: 14, lineHeight: 20 }}>
            •  {l}
          </Text>
        ))}
        <Pressable
          onPress={close}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => ({ alignSelf: 'flex-end', backgroundColor: c.brandGold, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 18, marginTop: space.xs, opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ color: c.brand, fontWeight: '800' }}>Got it</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
