import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { formatDate } from '@/lib/dates';
import { radius, space, useColors } from '@/theme';
import { Calendar } from './calendar';
import { Sheet } from './round-setup';

/** A date (YYYY-MM-DD) you tap to change, with a calendar in a sheet. */
export function DateField({ label, value, onChange, min, max }: { label: string; value: string; onChange: (d: string) => void; min?: string; max?: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatDate(value)}. Tap to choose a date.`}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: space.md, backgroundColor: c.card, opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ flex: 1 }}>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>{label.toUpperCase()}{'\n'}</Text>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{formatDate(value, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</Text>
        </Text>
        <Text style={{ fontSize: 20 }} accessibilityElementsHidden>📅</Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <Calendar
          selected={value}
          initial={value}
          onSelect={(d) => {
            if ((min && d < min) || (max && d > max)) return;
            onChange(d);
            setOpen(false);
          }}
        />
        {min ? <Text style={{ color: c.muted, fontSize: 12, marginTop: space.sm }}>Can’t be before {formatDate(min)}.</Text> : null}
        {max ? <Text style={{ color: c.muted, fontSize: 12, marginTop: space.sm }}>Can’t be after {formatDate(max)}.</Text> : null}
      </Sheet>
    </>
  );
}
