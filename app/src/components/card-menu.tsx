/**
 * A "⋯" button for a card's top-right corner that opens a small dropdown (e.g. Hide, Delete) right under it.
 */
import { useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { radius, useColors } from '@/theme';

export type MenuOption = { label: string; onPress: () => void; danger?: boolean; icon?: string };

export function CardMenu({ options, label = 'More options', light }: { options: MenuOption[]; label?: string; /** On a dark card. */ light?: boolean }) {
  const c = useColors();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  if (!options.length) return null;
  const open = () => ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAt({ x: x + w, y: y + h + 4 }));
  return (
    <>
      <View ref={ref} collapsable={false}>
      <Pressable onPress={open} hitSlop={10} accessibilityRole="button" accessibilityLabel={label}
        style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? (light ? '#ffffff22' : c.chip) : 'transparent' })}>
        <Text style={{ color: light ? '#fff' : c.muted, fontSize: 20, fontWeight: '800', lineHeight: 22 }}>⋯</Text>
      </Pressable>
      </View>
      <Modal visible={!!at} transparent animationType="fade" onRequestClose={() => setAt(null)}>
        <Pressable style={{ flex: 1 }} onPress={() => setAt(null)} accessibilityLabel="Close menu">
          {at ? (
            <View style={{ position: 'absolute', top: at.y, left: Math.max(8, at.x - 170), width: 170, backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
              {options.map((o, i) => (
                <Pressable key={o.label} onPress={() => { setAt(null); o.onPress(); }} accessibilityRole="menuitem"
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.border, backgroundColor: pressed ? c.chip : c.card })}>
                  {o.icon ? <Text style={{ fontSize: 15 }}>{o.icon}</Text> : null}
                  <Text style={{ color: o.danger ? c.danger : c.text, fontSize: 15, fontWeight: '600' }}>{o.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}
