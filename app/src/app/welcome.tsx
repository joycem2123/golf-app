import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogoMark, Wordmark } from '@/components/logo';
import { Body, Button, Card, Field } from '@/components/ui';
import { ensureSession, signIn, signUp } from '@/sync/auth';
import { useStore } from '@/store/store';
import { radius, space, useColors } from '@/theme';

type Mode = 'choose' | 'signIn' | 'signUp';

export default function Welcome() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const setOnboarded = useStore((s) => s.setOnboarded);
  const [mode, setMode] = useState<Mode>('choose');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const done = () => {
    setOnboarded(true);
    router.replace('/');
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.primary }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + space.xl * 2, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.xl }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: space.md, marginBottom: space.xl * 1.5 }}>
          <LogoMark size={88} />
          <Wordmark size={44} color="#FFFFFF" />
          <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700', letterSpacing: 3 }}>MATCHES · GAMES · BRAGGING RIGHTS</Text>
        </View>

        {mode === 'choose' && (
          <View style={{ gap: space.md, marginTop: 'auto' }}>
            <Button title="Sign in" onPress={() => setMode('signIn')} kind="secondary" />
            <Button title="Create account" onPress={() => setMode('signUp')} kind="secondary" />
            <View style={{ borderTopWidth: 1, borderTopColor: '#ffffff33', marginVertical: space.sm }} />
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              style={({ pressed }) => ({ borderWidth: 1.5, borderColor: '#ffffffcc', borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', opacity: pressed || busy ? 0.6 : 1 })}
              onPress={() =>
                run(async () => {
                  // Guests get a temporary online session so they can still join and share.
                  // If there's no signal, carry on offline.
                  await ensureSession().catch(() => undefined);
                  done();
                })
              }>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', letterSpacing: 0.5 }}>{busy ? 'Starting…' : 'Continue as guest'}</Text>
            </Pressable>
            <Text style={{ color: '#ffffffaa', textAlign: 'center', fontSize: 13 }}>
              Guests can score rounds and follow leaderboards. Create an account any time from Profile to keep your history.
            </Text>
          </View>
        )}

        {mode !== 'choose' && (
          <Card style={{ marginTop: 'auto', borderRadius: radius.lg }}>
            <Text style={{ color: c.primary, fontSize: 20, fontWeight: '700' }}>{mode === 'signIn' ? 'Welcome back' : 'Create your account'}</Text>
            {mode === 'signUp' && <Field label="Your name" value={name} onChangeText={setName} placeholder="Mike" autoCapitalize="words" />}
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <Field label="Password" value={password} onChangeText={setPassword} placeholder="At least 6 characters" secureTextEntry autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} />
            {message ? <Body style={{ color: message.error ? c.danger : c.primary }}>{message.text}</Body> : null}
            <Button
              title={busy ? 'Please wait…' : mode === 'signIn' ? 'Sign in' : 'Create account'}
              disabled={busy || !email.includes('@') || password.length < 6 || (mode === 'signUp' && !name.trim())}
              onPress={() =>
                run(async () => {
                  if (mode === 'signIn') {
                    await signIn(email.trim(), password);
                    return done();
                  }
                  const { needsConfirmation } = await signUp(email.trim(), password, name);
                  if (!needsConfirmation) return done();
                  setMessage({ text: 'Check your email and tap the confirmation link, then come back and sign in.' });
                  setMode('signIn');
                })
              }
            />
            <Button title="Back" kind="ghost" onPress={() => { setMode('choose'); setMessage(null); }} />
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
