import { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, View } from 'react-native';

const COLORS = ['#1F5A3D', '#A8864D', '#3366B0', '#B3261E', '#E9C46A', '#2E7D4F'];

/** A one-off burst of falling confetti over the screen (doesn't block touches). */
export function Confetti({ count = 60 }: { count?: number }) {
  const { width, height } = Dimensions.get('window');
  const progress = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width,
        drift: (Math.random() - 0.5) * 120,
        delay: Math.random() * 0.35,
        size: 6 + Math.random() * 6,
        spin: (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 4),
        color: COLORS[i % COLORS.length],
        round: Math.random() > 0.6,
      })),
    [count, width],
  );

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 3200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [progress]);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: 10 }}>
      {pieces.map((p, i) => {
        const t = progress.interpolate({ inputRange: [p.delay, 1], outputRange: [0, 1], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: p.x,
              top: -20,
              width: p.size,
              height: p.round ? p.size : p.size * 0.45,
              borderRadius: p.round ? p.size / 2 : 1,
              backgroundColor: p.color,
              opacity: progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.9] }) },
                { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
                { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 180}deg`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
