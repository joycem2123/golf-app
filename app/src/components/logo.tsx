import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { fonts, useColors } from '@/theme';

const MARK = require('../../assets/images/rivl-mark.png');
const BADGE = require('../../assets/images/rivl-badge.png');

/**
 * Brand mark (placeholder until the Clutch Up logo is chosen): the gold R with a ball on a tee.
 * On the dark brand green it's drawn on its own; elsewhere it sits in its green badge.
 */
export function LogoMark({ size = 56, badge }: { size?: number; badge?: boolean }) {
  if (badge) {
    return <Image source={BADGE} style={{ width: size, height: size, borderRadius: size * 0.22 }} accessibilityLabel="Clutch Up Golf" />;
  }
  return (
    <View style={{ width: size, height: size }} accessibilityLabel="Clutch Up Golf">
      <Image source={MARK} style={{ width: size, height: size }} contentFit="contain" />
    </View>
  );
}

/** "Clutch Up" in the brand serif; `golf` adds a small, widely spaced GOLF underneath. */
export function Wordmark({ size = 30, color, golf }: { size?: number; color?: string; golf?: boolean }) {
  const c = useColors();
  return (
    <View style={{ alignItems: golf ? 'center' : 'flex-start' }} accessibilityLabel="Clutch Up Golf">
      <Text style={{ fontFamily: fonts.serif, fontSize: size, fontWeight: '700', color: color ?? c.brand, letterSpacing: size * 0.04 }}>Clutch Up</Text>
      {golf && <Text style={{ color: c.brandGold, fontSize: size * 0.3, fontWeight: '800', letterSpacing: size * 0.3, marginTop: -size * 0.05, marginRight: -size * 0.3 }}>GOLF</Text>}
    </View>
  );
}
