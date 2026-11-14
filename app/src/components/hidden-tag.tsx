import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useStore } from '@/store/store';
import { useColors } from '@/theme';

/** A hidden round or event (shown with Show hidden): marked, with Unhide. */
export function HiddenTag({ id, children }: { id: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ position: 'relative' }}>
      <View style={{ opacity: 0.6, zIndex: 0 }}>{children}</View>
      {/* Top-right of the card, above the swipe area so the tap always lands. */}
      <Pressable onPress={() => useStore.getState().setHidden(id, false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Unhide"
        style={({ pressed }) => ({ position: 'absolute', top: 10, right: 10, zIndex: 20, elevation: 20, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.card, borderWidth: 1, borderColor: c.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ fontSize: 12 }}>👁</Text>
        <Text style={{ color: c.primary, fontSize: 13, fontWeight: '800' }}>Unhide</Text>
      </Pressable>
    </View>
  );
}
