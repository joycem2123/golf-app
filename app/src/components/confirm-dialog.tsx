import { Modal, Pressable, Text, View } from 'react-native';

import { fonts, radius, space, useColors } from '@/theme';

/** MatchDay-styled confirmation pop-up. */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const c = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
        <View accessibilityRole="alert" style={{ width: '100%', maxWidth: 360, backgroundColor: c.card, borderRadius: radius.lg, overflow: 'hidden' }}>
          <View style={{ height: 3, backgroundColor: c.accent }} />
          <View style={{ padding: space.xl, gap: space.sm, alignItems: 'center' }}>
            <Text style={{ fontFamily: fonts.serif, fontSize: 20, fontWeight: '700', color: c.text, textAlign: 'center' }}>{title}</Text>
            {message ? <Text style={{ color: c.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>{message}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.border }}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={({ pressed }) => ({ flex: 1, paddingVertical: space.lg, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{cancelLabel}</Text>
            </Pressable>
            <View style={{ width: 1, backgroundColor: c.border }} />
            <Pressable accessibilityRole="button" onPress={onConfirm} style={({ pressed }) => ({ flex: 1, paddingVertical: space.lg, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: destructive ? c.danger : c.primary, fontSize: 16, fontWeight: '800' }}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
