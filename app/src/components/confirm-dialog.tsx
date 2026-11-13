import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native';

import { fonts, radius, space, useColors } from '@/theme';

/** Clutch Up-styled confirmation pop-up. */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
  children,
  confirmDisabled,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra content under the message (e.g. a password box). */
  children?: React.ReactNode;
  confirmDisabled?: boolean;
}) {
  const c = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* Moves up when the keyboard opens, so a box in the pop-up (e.g. a password) stays visible. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
        <View accessibilityRole="alert" style={{ width: '100%', maxWidth: 360, backgroundColor: c.card, borderRadius: radius.lg, overflow: 'hidden' }}>
          <View style={{ height: 3, backgroundColor: c.accent }} />
          <View style={{ padding: space.xl, gap: space.sm, alignItems: 'center' }}>
            <Text style={{ fontFamily: fonts.serif, fontSize: 20, fontWeight: '700', color: c.text, textAlign: 'center' }}>{title}</Text>
            {message ? <Text style={{ color: c.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>{message}</Text> : null}
            {children ? <View style={{ alignSelf: 'stretch', marginTop: space.sm, gap: space.sm }}>{children}</View> : null}
          </View>
          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.border }}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={({ pressed }) => ({ flex: 1, paddingVertical: space.lg, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{cancelLabel}</Text>
            </Pressable>
            <View style={{ width: 1, backgroundColor: c.border }} />
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!confirmDisabled }} disabled={confirmDisabled} onPress={onConfirm} style={({ pressed }) => ({ flex: 1, paddingVertical: space.lg, alignItems: 'center', opacity: confirmDisabled ? 0.35 : pressed ? 0.6 : 1 })}>
              <Text style={{ color: destructive ? c.danger : c.primary, fontSize: 16, fontWeight: '800' }}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
