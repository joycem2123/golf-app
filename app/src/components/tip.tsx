/**
 * One-time pop-up tips: a small card that slides up the first time you reach a screen.
 * Each tip shows once per phone; "Show tips again" in More brings them back.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { Animated, Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
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
  // The one-time welcome video pop-up comes back too.
  await AsyncStorage.removeItem('tutorial:offered').catch(() => undefined);
}

/** A ref to the part of the screen a tip points at. */
export type TipTarget = RefObject<ComponentRef<typeof View> | null>;

type Rect = { x: number; y: number; w: number; h: number };
const BUBBLE_W = 280;

export function Tip({
  id,
  title,
  lines,
  when = true,
  target,
}: {
  id: string;
  title: string;
  lines: string[];
  /** Only show once this is true (e.g. there's a round to swipe). */
  when?: boolean;
  /** Point at this part of the screen and outline it. Without it the tip sits at the bottom. */
  target?: TipTarget;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!when) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void loadSeen().then((s) => {
        if (cancelled || s.has(id) || (showing && showing !== id)) return;
        const open = (r: Rect | null) => {
          if (cancelled) return;
          showing = id;
          setRect(r);
          setVisible(true);
          track('tip_shown', { tip: id });
          Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
              Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: true }),
            ]),
          ).start();
        };
        if (!target) return open(null);
        const node = target.current;
        if (!node) return; // nothing to point at yet
        node.measureInWindow((x: number, y: number, w: number, h: number) => {
          // Only point at it if it's actually on screen.
          if (!w || !h || y < insets.top || y + h > win.height - 80) return;
          open({ x, y, w, h });
        });
      });
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(t);
      if (showing === id) showing = null;
    };
  }, [id, when, target, anim, pulse, insets.top, win.height]);

  if (!visible) return null;
  const close = () => {
    markSeen(id);
    track('tip_dismissed', { tip: id });
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setVisible(false);
      pulse.stopAnimation();
      if (showing === id) showing = null;
    });
  };

  const bg = 'rgba(20, 53, 42, 0.86)'; // brand green, see-through
  const width = Math.min(BUBBLE_W, win.width - space.md * 2);
  // Bubble below the target if there's room, otherwise above it.
  const below = rect ? rect.y + rect.h + 190 < win.height - insets.bottom : false;
  const left = rect ? Math.max(space.md, Math.min(rect.x + rect.w / 2 - width / 2, win.width - space.md - width)) : (win.width - width) / 2;
  const arrowLeft = rect ? Math.max(14, Math.min(rect.x + rect.w / 2 - left - 8, width - 30)) : 0;
  const slide = anim.interpolate({ inputRange: [0, 1], outputRange: [below ? -12 : 12, 0] });

  const bubble = (
    <View style={{ backgroundColor: bg, borderRadius: radius.md, paddingVertical: space.sm + 2, paddingHorizontal: space.md, gap: 4 }}>
      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{title}</Text>
      {lines.map((l) => (
        <Text key={l} style={{ color: '#ffffffe6', fontSize: 13, lineHeight: 18 }}>
          {lines.length > 1 ? '•  ' : ''}{l}
        </Text>
      ))}
      <Text style={{ color: c.brandGold, fontWeight: '800', fontSize: 13, alignSelf: 'flex-end', marginTop: 2 }}>Got it</Text>
    </View>
  );
  // A triangle (not a rotated square) so the see-through colours don't overlap.
  const arrow = (
    <View
      style={{
        position: 'absolute', left: arrowLeft, width: 0, height: 0,
        borderLeftWidth: 9, borderRightWidth: 9, borderLeftColor: 'transparent', borderRightColor: 'transparent',
        ...(below ? { top: -9, borderBottomWidth: 9, borderBottomColor: bg } : { bottom: -9, borderTopWidth: 9, borderTopColor: bg }),
      }}
    />
  );

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      {/* Tap anywhere to close. */}
      <Pressable style={{ flex: 1 }} onPress={close} accessibilityRole="button" accessibilityLabel={`Tip: ${title}. ${lines.join(' ')} Tap to close.`}>
        {rect && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: rect.x - 5,
              top: rect.y - 5,
              width: rect.w + 10,
              height: rect.h + 10,
              borderRadius: radius.lg + 4,
              borderWidth: 2.5,
              borderColor: c.brandGold,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.015] }) }],
            }}
          />
        )}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width,
            left,
            ...(rect
              ? below
                ? { top: rect.y + rect.h + 14 }
                : { bottom: win.height - rect.y + 14 }
              : { bottom: insets.bottom + 90 }),
            opacity: anim,
            transform: [{ translateY: slide }],
          }}>
          {rect && arrow}
          {bubble}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
