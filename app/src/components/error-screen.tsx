import { router, type ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, Text } from 'react-native';

import { reportError } from '@/lib/crash-guard';
import { fonts, space, useColors } from '@/theme';
import { Body, Button } from './ui';

/** Shown instead of a screen that hit an error, so the app stays open. Export it from a route as ErrorBoundary. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const c = useColors();
  useEffect(() => reportError('render', error), [error]);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space.lg, gap: space.md }}>
      <Text style={{ fontFamily: fonts.serif, fontSize: 26, fontWeight: '700', color: c.primary, textAlign: 'center' }}>Something went wrong</Text>
      <Body muted style={{ textAlign: 'center' }}>This screen hit a problem. Your scores are saved. We’ve been sent the details so we can fix it.</Body>
      <Button title="Try again" onPress={() => void retry()} />
      <Button title="Go home" kind="secondary" onPress={() => router.replace('/')} />
      <Text selectable style={{ color: c.muted, fontSize: 11, textAlign: 'center' }}>{error.message.slice(0, 200)}</Text>
    </ScrollView>
  );
}
