/** A ☆ / ★ toggle: keep a course in Favourites. */
import { Pressable, Text } from 'react-native';

import { useColors } from '@/theme';

export function Star({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label}
      style={({ pressed }) => ({ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ fontSize: 26, color: on ? c.accent : c.muted, lineHeight: 30 }}>{on ? '★' : '☆'}</Text>
    </Pressable>
  );
}
