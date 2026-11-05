import { Text, View } from 'react-native';

import { fonts, useColors } from '@/theme';

/** MatchDay mark: a flagstick in a gold-rimmed roundel. */
export function LogoMark({ size = 56 }: { size?: number }) {
  const c = useColors();
  const s = size / 56;
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2, backgroundColor: c.primary,
        borderWidth: 2.5 * s, borderColor: c.accent, alignItems: 'center', justifyContent: 'center',
      }}>
      {/* flag */}
      <View style={{ position: 'absolute', left: 25 * s, top: 13 * s, width: 0, height: 0, borderTopWidth: 6 * s, borderBottomWidth: 6 * s, borderLeftWidth: 14 * s, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: c.accent }} />
      {/* pole */}
      <View style={{ position: 'absolute', left: 23 * s, top: 12 * s, width: 2.5 * s, height: 27 * s, backgroundColor: '#FFFFFF', borderRadius: 1 }} />
      {/* cup */}
      <View style={{ position: 'absolute', left: 16 * s, top: 37 * s, width: 17 * s, height: 5 * s, borderRadius: 3 * s, backgroundColor: '#FFFFFF', opacity: 0.9 }} />
    </View>
  );
}

export function Wordmark({ size = 30, color }: { size?: number; color?: string }) {
  const c = useColors();
  return (
    <Text style={{ fontFamily: fonts.serif, fontSize: size, fontWeight: '700', color: color ?? c.primary, letterSpacing: 0.5 }}>
      Match<Text style={{ color: c.accent }}>Day</Text>
    </Text>
  );
}
