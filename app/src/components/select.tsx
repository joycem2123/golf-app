/**
 * A compact dropdown: a box showing the choice, which opens a small pop-up list in the middle of the screen
 * (not a full-page sheet). Single choice closes on tap; multiple choice has a Done button.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { fonts, radius, space, useColors } from '@/theme';

type Option = { value: string; label: string };

function Popup({ title, open, onClose, children, footer }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const c = useColors();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
        {/* Taps inside the card don't close it. */}
        <Pressable onPress={() => undefined} style={{ width: '100%', maxWidth: 320, maxHeight: '60%', backgroundColor: c.card, borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }}>
          <Text style={{ fontFamily: fonts.serif, fontWeight: '700', fontSize: 17, color: c.text, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm }}>{title}</Text>
          <ScrollView style={{ flexGrow: 0 }}>{children}</ScrollView>
          {footer}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ label, on, onPress, multiple }: { label: string; on: boolean; onPress: () => void; multiple?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityState={multiple ? { checked: on } : { selected: on }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: 11, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: pressed ? c.chip : undefined })}>
      <Text style={{ flex: 1, color: c.text, fontSize: 16, fontWeight: on ? '700' : '400' }}>{label}</Text>
      {multiple ? (
        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : c.card, alignItems: 'center', justifyContent: 'center' }}>
          {on ? <Text style={{ color: c.onPrimary, fontSize: 13, fontWeight: '900' }}>✓</Text> : null}
        </View>
      ) : on ? <Text style={{ color: c.primary, fontSize: 17, fontWeight: '900' }}>✓</Text> : null}
    </Pressable>
  );
}

function Box({ text, placeholder, onPress, label }: { text: string; placeholder?: string; onPress: () => void; label: string }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${text || placeholder || 'none'}. Tap to change.`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10, backgroundColor: c.card, opacity: pressed ? 0.7 : 1 })}>
      <Text numberOfLines={1} style={{ flex: 1, color: text ? c.text : c.muted, fontSize: 15, fontWeight: '600' }}>{text || placeholder}</Text>
      <Text style={{ color: c.primary, fontSize: 12 }}>▼</Text>
    </Pressable>
  );
}

/** Pick one. */
export function Select({ label, value, options, onChange, placeholder }: { label: string; value: string | null; options: Option[]; onChange: (v: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Box label={label} text={options.find((o) => o.value === value)?.label ?? ''} placeholder={placeholder} onPress={() => setOpen(true)} />
      <Popup title={label} open={open} onClose={() => setOpen(false)}>
        {options.map((o) => <Row key={o.value} label={o.label} on={o.value === value} onPress={() => { onChange(o.value); setOpen(false); }} />)}
      </Popup>
    </>
  );
}

/** Pick one or more. */
export function MultiSelect({ label, values, options, onChange, placeholder }: { label: string; values: string[]; options: Option[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const text = options.filter((o) => values.includes(o.value)).map((o) => o.label).join(', ');
  return (
    <>
      <Box label={label} text={text} placeholder={placeholder} onPress={() => setOpen(true)} />
      <Popup title={label} open={open} onClose={() => setOpen(false)}
        footer={
          <Pressable onPress={() => setOpen(false)} accessibilityRole="button" style={({ pressed }) => ({ borderTopWidth: 1, borderTopColor: c.border, paddingVertical: 13, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: c.primary, fontFamily: fonts.serif, fontWeight: '700', fontSize: 16 }}>Done</Text>
          </Pressable>
        }>
        {options.map((o) => {
          const on = values.includes(o.value);
          return <Row key={o.value} multiple label={o.label} on={on} onPress={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])} />;
        })}
      </Popup>
    </>
  );
}
