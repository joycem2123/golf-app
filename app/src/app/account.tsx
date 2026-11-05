import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Body, Button, Card, Field, H2, Label, Segmented } from '@/components/ui';
import { saveProfileName, signIn, signOut, signUp, useSession } from '@/sync/auth';
import { useStore } from '@/store/store';
import { space, useColors } from '@/theme';

export default function Account() {
  const c = useColors();
  const session = useSession();
  const names = useStore((s) => s.names);
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signUp');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const user = session?.user;
  const isGuest = !!user?.is_anonymous;

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

  if (session === undefined) return null;

  if (user && !isGuest) {
    return (
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Card>
          <Label>Signed in</Label>
          <H2>{names[user.id] ?? user.user_metadata?.name ?? user.email}</H2>
          <Body muted>{user.email}</Body>
        </Card>
        <Card>
          <Field label="Display name" value={name} onChangeText={setName} placeholder={names[user.id] ?? 'Your name'} />
          <Button small kind="secondary" title="Save name" disabled={!name.trim() || busy} onPress={() => run(async () => { await saveProfileName(name); setMessage({ text: 'Saved.' }); })} />
        </Card>
        {message ? <Body style={{ color: message.error ? c.danger : c.primary }}>{message.text}</Body> : null}
        <Button title="Sign out" kind="ghost" onPress={() => run(signOut)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
      <Body muted>
        An account lets you share rounds, keep score with friends on their phones, and keep your history. You don’t need one to score on your own, or to follow a leaderboard with a code.
      </Body>
      {isGuest ? <Body muted>You’re currently using a guest session.</Body> : null}
      <Segmented options={[{ value: 'signUp', label: 'Create account' }, { value: 'signIn', label: 'Sign in' }]} value={mode} onChange={setMode} />
      <Card>
        {mode === 'signUp' && <Field label="Your name" value={name} onChangeText={setName} placeholder="Mike" autoCapitalize="words" />}
        <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Password" value={password} onChangeText={setPassword} placeholder="At least 6 characters" secureTextEntry autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} />
        <View style={{ marginTop: space.sm }}>
          <Button
            title={busy ? 'Please wait…' : mode === 'signUp' ? 'Create account' : 'Sign in'}
            disabled={busy || !email.includes('@') || password.length < 6 || (mode === 'signUp' && !name.trim())}
            onPress={() =>
              run(async () => {
                if (mode === 'signIn') {
                  await signIn(email.trim(), password);
                  return;
                }
                const { needsConfirmation } = await signUp(email.trim(), password, name);
                if (needsConfirmation) {
                  setMessage({ text: 'Almost done: open the email Supabase sent you and tap the link to confirm, then come back and sign in.' });
                  setMode('signIn');
                }
              })
            }
          />
        </View>
      </Card>
      {message ? <Body style={{ color: message.error ? c.danger : c.primary }}>{message.text}</Body> : null}
    </ScrollView>
  );
}
