import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { cleanUsername, USERNAME_RULE, usernameAvailable } from '@/sync/auth';
import { radius, space, useColors } from '@/theme';
import { Label } from './ui';

export type UsernameStatus = 'empty' | 'invalid' | 'checking' | 'available' | 'taken' | 'offline';

/** @username input that checks availability as you type. */
export function UsernameField({
  value,
  onChange,
  onStatus,
  current,
  onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onStatus: (s: UsernameStatus) => void;
  /** My existing username (always counts as available). */
  current?: string | null;
  onFocus?: () => void;
}) {
  const c = useColors();
  const [status, setStatus] = useState<UsernameStatus>('empty');

  useEffect(() => {
    let cancelled = false;
    const report = (s: UsernameStatus) => {
      if (cancelled) return;
      setStatus(s);
      onStatus(s);
    };
    if (!value) return report('empty');
    if (!USERNAME_RULE.test(value)) return report('invalid');
    if (current && value === current) return report('available');
    report('checking');
    const t = setTimeout(() => {
      usernameAvailable(value).then((ok) => report(ok ? 'available' : 'taken')).catch(() => report('offline'));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, current]);

  const msg: Record<UsernameStatus, { text: string; color: string }> = {
    empty: { text: '3–20 characters: letters, numbers, _ or .', color: c.muted },
    invalid: { text: 'Use 3–20 lowercase letters, numbers, _ or .', color: c.danger },
    checking: { text: 'Checking…', color: c.muted },
    available: { text: `@${value} is available`, color: c.primary },
    taken: { text: `@${value} is taken. Try another.`, color: c.danger },
    offline: { text: 'Can’t check right now (no connection).', color: c.danger },
  };

  return (
    <View style={{ gap: space.xs }}>
      <Label>Username</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.chip, borderRadius: radius.sm, borderWidth: 1, borderColor: status === 'available' ? c.primary : status === 'taken' || status === 'invalid' ? c.danger : c.border }}>
        <Text style={{ color: c.muted, fontSize: 16, paddingLeft: space.md }}>@</Text>
        <TextInput
          value={value}
          onChangeText={(v) => onChange(cleanUsername(v))}
          placeholder="joyce"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Username"
          onFocus={onFocus}
          style={{ flex: 1, color: c.text, fontSize: 16, paddingVertical: 10, paddingHorizontal: 4 }}
        />
      </View>
      <Text style={{ color: msg[status].color, fontSize: 12 }}>{msg[status].text}</Text>
    </View>
  );
}
