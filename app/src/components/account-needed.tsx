/**
 * Guests (no account) can only follow rounds and events. Everything else asks them to create a free account.
 */
import { router, Stack } from 'expo-router';
import { Alert, ScrollView, Text } from 'react-native';

import { Body, Button, Card } from '@/components/ui';
import { useStore } from '@/store/store';
import { useSession } from '@/sync/auth';
import { fonts, space, useColors } from '@/theme';

/** Am I a guest (no account)? False while still loading, so nothing flashes. */
export function useIsGuest(): boolean {
  const session = useSession();
  if (session === undefined) return false;
  return !session?.user || !!session.user.is_anonymous;
}

const signUp = () => {
  useStore.getState().setOnboarded(false);
  router.replace('/welcome');
};

/** For a button: say an account is needed (and offer to create one). Returns true if blocked. */
export function needsAccount(guest: boolean, what: string): boolean {
  if (!guest) return false;
  Alert.alert('Create a free account', `Create a free account to ${what}. As a guest you can follow rounds and events.`, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Create account', onPress: signUp },
  ]);
  return true;
}

/** A whole screen a guest can't use. */
export function AccountNeeded({ what, title }: { what: string; title?: string }) {
  const c = useColors();
  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
      {title ? <Stack.Screen options={{ title }} /> : null}
      <Card style={{ gap: space.sm }}>
        <Text style={{ fontSize: 34, textAlign: 'center' }}>⛳</Text>
        <Text style={{ fontFamily: fonts.serif, fontWeight: '700', fontSize: 22, color: c.text, textAlign: 'center' }}>Create a free account to {what}</Text>
        <Body muted style={{ textAlign: 'center' }}>As a guest you can follow rounds and events with a code. An account takes about 30 seconds and keeps your scores and history.</Body>
        <Button title="Create account or sign in" onPress={signUp} />
      </Card>
    </ScrollView>
  );
}
