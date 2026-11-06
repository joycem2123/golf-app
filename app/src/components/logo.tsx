import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { fonts, useColors } from '@/theme';

const MARK = require('../../assets/images/rivl-mark.png');
const BADGE = require('../../assets/images/rivl-badge.png');

/**
 * RIVL mark: the gold R with a ball on a tee.
 * On the dark brand green it's drawn on its own; elsewhere it sits in its green badge.
 */
export function LogoMark({ size = 56, badge }: { size?: number; badge?: boolean }) {
  if (badge) {
    return <Image source={BADGE} style={{ width: size, height: size, borderRadius: size * 0.22 }} accessibilityLabel="RIVL" />;
  }
  return (
    <View style={{ width: size, height: size }} accessibilityLabel="RIVL">
      <Image source={MARK} style={{ width: size, height: size }} contentFit="contain" />
    </View>
  );
}

/** "RIVL" in the brand serif, widely spaced. */
export function Wordmark({ size = 30, color }: { size?: number; color?: string }) {
  const c = useColors();
  return (
    <Text style={{ fontFamily: fonts.serif, fontSize: size, fontWeight: '700', color: color ?? c.brand, letterSpacing: size * 0.22 }}>RIVL</Text>
  );
}
