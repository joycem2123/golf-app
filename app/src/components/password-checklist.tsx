import { Text, View } from 'react-native';

import { PASSWORD_RULES } from '@/lib/password';
import { useColors } from '@/theme';

/** Live checklist under a new-password box: each rule ticks green as it's met. */
export function PasswordChecklist({ password, onDark }: { password: string; onDark?: boolean }) {
  const c = useColors();
  const off = onDark ? '#ffffff99' : c.muted;
  const on = onDark ? '#9BE3B4' : c.primary;
  return (
    <View style={{ gap: 2, marginTop: -2 }}>
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        return (
          <Text key={r.id} style={{ color: ok ? on : off, fontSize: 13 }} accessibilityLabel={`${r.label}: ${ok ? 'done' : 'not yet'}`}>
            {ok ? '✓' : '○'}  {r.label}
          </Text>
        );
      })}
    </View>
  );
}
