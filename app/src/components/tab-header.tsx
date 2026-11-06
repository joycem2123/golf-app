import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, space, useColors } from '@/theme';
import { LogoMark } from './logo';

/** Green banner at the top of each tab. */
export function TabHeader({ title, sub }: { title: string; sub?: string }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: c.brand, paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, paddingBottom: space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <LogoMark size={30} />
        <Text style={{ color: c.brandGold, fontSize: 12, fontWeight: '800', letterSpacing: 3 }}>RIVL</Text>
      </View>
      <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 30, fontWeight: '700', marginTop: space.sm }}>{title}</Text>
      {sub ? <Text style={{ color: '#ffffffbb', fontSize: 14 }}>{sub}</Text> : null}
    </View>
  );
}
