import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fromISODate, MONTHS, pad, today } from '@/lib/dates';
import { fonts, radius, space, useColors } from '@/theme';

/** Month calendar. `marks` are dates that have matches (shown with a dot). */
export function Calendar({
  selected,
  onSelect,
  marks = {},
  initial,
}: {
  selected?: string;
  onSelect: (date: string) => void;
  marks?: Record<string, number>;
  initial?: string;
}) {
  const c = useColors();
  const start = fromISODate(initial ?? selected ?? today());
  const [month, setMonth] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const first = new Date(month.y, month.m, 1);
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const lead = first.getDay(); // Sunday first
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const iso = (d: number) => `${month.y}-${pad(month.m + 1)}-${pad(d)}`;
  const now = today();
  const shift = (n: number) => setMonth(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));

  return (
    <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm }}>
        <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityLabel="Previous month"><Text style={{ color: c.primary, fontSize: 22, paddingHorizontal: 8 }}>‹</Text></Pressable>
        <Text style={{ fontFamily: fonts.serif, fontSize: 18, fontWeight: '700', color: c.primary }}>{MONTHS[month.m]} {month.y}</Text>
        <Pressable onPress={() => shift(1)} hitSlop={10} accessibilityLabel="Next month"><Text style={{ color: c.primary, fontSize: 22, paddingHorizontal: 8 }}>›</Text></Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.muted, fontSize: 11, fontWeight: '700' }}>{d}</Text>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, w) => (
        <View key={w} style={{ flexDirection: 'row' }}>
          {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
            if (d === null) return <View key={i} style={{ flex: 1, height: 42 }} />;
            const date = iso(d);
            const isSel = date === selected;
            const isToday = date === now;
            const count = marks[date] ?? 0;
            return (
              <Pressable key={i} onPress={() => onSelect(date)} style={{ flex: 1, height: 42, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={date}>
                <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: isSel ? c.primary : 'transparent', borderWidth: isToday && !isSel ? 1 : 0, borderColor: c.accent }}>
                  <Text style={{ color: isSel ? '#fff' : c.text, fontWeight: count ? '800' : '400' }}>{d}</Text>
                </View>
                {count > 0 && <View style={{ position: 'absolute', bottom: 2, width: 5, height: 5, borderRadius: 3, backgroundColor: isSel ? c.accent : c.primary }} />}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
