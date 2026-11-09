/** One hole's score read from a scorecard photo: type to fix it. Hard-to-read ones are highlighted in gold. */
import { TextInput } from 'react-native';

import { radius, useColors } from '@/theme';

export function ScoreCell({ value, unsure, onChange, label }: { value: number | null; unsure: boolean; onChange: (v: number | null) => void; label: string }) {
  const c = useColors();
  return (
    <TextInput
      value={value === null ? '' : String(value)}
      onChangeText={(t) => {
        const n = parseInt(t.replace(/[^0-9]/g, '').slice(0, 2), 10);
        onChange(Number.isFinite(n) && n > 0 ? n : null);
      }}
      keyboardType="number-pad"
      selectTextOnFocus
      accessibilityLabel={label}
      style={{
        flex: 1, flexBasis: 0, minWidth: 0, height: 36, textAlign: 'center', fontSize: 15, fontWeight: '700', color: c.text, padding: 0,
        borderWidth: unsure ? 2 : 1, borderColor: unsure ? c.brandGold : c.border, borderRadius: radius.sm,
        backgroundColor: unsure ? '#B4895422' : c.card,
      }}
    />
  );
}
