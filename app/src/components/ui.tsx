import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { fonts, radius, space, useColors } from '@/theme';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={[styles.h1, { color: c.text }]}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={[styles.h2, { color: c.text }]}>{children}</Text>;
}

export function Label({ children, style }: { children: ReactNode; style?: object }) {
  const c = useColors();
  return <Text style={[styles.label, { color: c.text, opacity: 0.72 }, style]}>{children}</Text>;
}

export function Body({ children, muted, bold, style }: { children: ReactNode; muted?: boolean; bold?: boolean; style?: object }) {
  const c = useColors();
  return (
    <Text style={[styles.body, { color: muted ? c.muted : c.text }, bold && { fontWeight: '700' }, style]}>{children}</Text>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  small,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  small?: boolean;
}) {
  const c = useColors();
  const bg = kind === 'primary' ? c.primary : kind === 'danger' ? c.danger : kind === 'secondary' ? c.primarySoft : 'transparent';
  const fg = kind === 'primary' || kind === 'danger' ? c.onPrimary : c.primary;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
      ]}>
      <Text style={[styles.buttonText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, color }: { label: string; selected?: boolean; onPress?: () => void; color?: string }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? (color ?? c.primary) : c.chip, borderColor: selected ? (color ?? c.primary) : c.border },
      ]}>
      <Text style={{ color: selected ? c.onPrimary : c.text, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  compact,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  compact?: boolean;
}) {
  const c = useColors();
  return (
    <View style={[styles.segmented, { backgroundColor: c.chip, borderColor: c.border }]}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segment, compact && { paddingVertical: 4 }, sel && { backgroundColor: c.card }]}>
            <Text style={{ color: sel ? c.primary : c.muted, fontWeight: sel ? '700' : '500', fontSize: compact ? 13 : 14, textAlign: 'center' }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  format,
  small,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  /** Compact (live scoring stats). */
  small?: boolean;
}) {
  const c = useColors();
  const btn = (label: string, next: number) => (
    <Pressable
      onPress={() => onChange(Math.min(max, Math.max(min, Math.round(next * 100) / 100)))}
      style={({ pressed }) => [styles.stepBtn, small && { width: 28, height: 28, borderRadius: 14 }, { backgroundColor: c.chip, opacity: pressed ? 0.6 : 1 }]}>
      <Text style={{ color: c.primary, fontSize: small ? 16 : 20, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.row}>
      {btn('−', value - step)}
      <Text style={[styles.stepValue, small && { minWidth: 30, fontSize: 16 }, { color: c.text }]}>{format ? format(value) : value}</Text>
      {btn('+', value + step)}
    </View>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const c = useColors();
  return (
    // The whole row is tappable, not just the switch.
    <View style={[styles.row, { justifyContent: 'space-between', paddingVertical: space.xs }]}>
      <Pressable style={{ flex: 1, paddingRight: space.md }} onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label}>
        <Body>{label}</Body>
        {hint ? <Label style={{ textTransform: 'none', letterSpacing: 0 }}>{hint}</Label> : null}
      </Pressable>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.primary }} />
    </View>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const c = useColors();
  const { label, style, secureTextEntry, ...rest } = props;
  // Password boxes get an eye button to show or hide what was typed.
  const [shown, setShown] = useState(false);
  const input = (
    <TextInput
      placeholderTextColor={c.muted}
      {...rest}
      secureTextEntry={secureTextEntry && !shown}
      autoCapitalize={secureTextEntry ? 'none' : rest.autoCapitalize}
      autoCorrect={secureTextEntry ? false : rest.autoCorrect}
      style={[styles.input, { color: c.text, backgroundColor: c.chip, borderColor: c.border }, secureTextEntry && { paddingRight: 48 }, style]}
    />
  );
  return (
    <View style={{ gap: space.xs, flex: 1 }}>
      <Label>{label}</Label>
      {secureTextEntry ? (
        <View style={{ justifyContent: 'center' }}>
          {input}
          <Pressable
            onPress={() => setShown((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            {Platform.OS === 'ios' ? (
              <SymbolView name={shown ? 'eye.slash' : 'eye'} tintColor={c.muted} size={20} />
            ) : (
              <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600' }}>{shown ? 'Hide' : 'Show'}</Text>
            )}
          </Pressable>
        </View>
      ) : (
        input
      )}
    </View>
  );
}

export function OptionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.xs, paddingVertical: space.xs }}>
      <Label>{label}</Label>
      {children}
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.sm, shadowColor: '#3B3423', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  h1: { fontSize: 30, fontFamily: fonts.serif, fontWeight: '700' },
  h2: { fontSize: 19, fontFamily: fonts.serif, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2 },
  body: { fontSize: 16 },
  button: { borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: space.lg, alignItems: 'center' },
  buttonSmall: { paddingVertical: 8, paddingHorizontal: space.md },
  buttonText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.5 },
  chip: { borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1 },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3, borderWidth: StyleSheet.hairlineWidth },
  segment: { flex: 1, paddingVertical: 8, borderRadius: radius.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stepBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 48, textAlign: 'center', fontSize: 18, fontWeight: '700' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 16 },
});
