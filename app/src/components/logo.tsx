import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { fonts, useColors } from '@/theme';

const MARK = require('../../assets/images/clutchup-mark.png');
const BADGE = require('../../assets/images/clutchup-badge.png');

/**
 * Clutch Up mark, "The Drop": the U of Up is the cup, with the ball dropping in.
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
      <Text style={{ fontFamily: fonts.brand, fontSize: size, color: color ?? c.brand, letterSpacing: -size * 0.02 }}>Clutch Up</Text>
      {golf && <Text style={{ fontFamily: fonts.brandMedium, color: c.brandGold, fontSize: size * 0.28, letterSpacing: size * 0.32, marginTop: -size * 0.02, marginRight: -size * 0.32 }}>GOLF</Text>}
    </View>
  );
}
