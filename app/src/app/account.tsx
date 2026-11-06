import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Body, Button, Card, Field, H2, Label } from '@/components/ui';
import { useMe } from '@/lib/me';
import { useStore } from '@/store/store';
import { changeEmail, changePassword, useSession } from '@/sync/auth';
import { radius, space, useColors } from '@/theme';

function Message({ text, error }: { text: string; error?: boolean }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: error ? '#FBEDEC' : c.primarySoft, borderRadius: radius.md, padding: space.md }}>
      <Text style={{ color: error ? c.danger : c.primary, fontSize: 14 }}>{text}</Text>
    </View>
  );
}

/** Account details: who I am, and changing my email or password. */
export default function Account() {
  const c = useColors();
  const session = useSession();
  const { me } = useMe();
  const username = useStore((s) => s.myUsername);
  const user = session?.user;

  const [newEmail, setNewEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [emailMsg, setEmailMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [pwMsg, setPwMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState<'email' | 'password' | null>(null);

  if (session === undefined) return null;
  if (!user || user.is_anonymous) {
    return (
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Card>
          <H2>No account yet</H2>
          <Body muted>You’re using RallyCap as a guest. Create an account to keep your history and change these details.</Body>
          <Button title="Create account or sign in" onPress={() => { useStore.getState().setOnboarded(false); router.replace('/welcome'); }} />
        </Card>
      </ScrollView>
    );
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim());
  const sameEmail = newEmail.trim().toLowerCase() === (user.email ?? '').toLowerCase();
  const pwProblem = !current ? null : next.length > 0 && next.length < 8 ? 'Use at least 8 characters.' : again && next !== again ? 'The new passwords don’t match.' : null;
  const pending = user.new_email;

  const saveEmail = async () => {
    setBusy('email');
    setEmailMsg(null);
    try {
      await changeEmail(newEmail, emailPw);
      setEmailMsg({ text: `We’ve emailed a confirmation link to both ${user.email} and ${newEmail.trim()}. Tap the link in each one, and your email changes. Until then, keep signing in with ${user.email}.` });
      setNewEmail('');
      setEmailPw('');
    } catch (e) {
      setEmailMsg({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(null);
    }
  };
  const savePassword = async () => {
    setBusy('password');
    setPwMsg(null);
    try {
      await changePassword(current, next);
      setPwMsg({ text: 'Password changed. Use the new one next time you sign in.' });
      setCurrent('');
      setNext('');
      setAgain('');
    } catch (e) {
      setPwMsg({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
      <Card>
        <H2>Your account</H2>
        {[
          ['Name', me?.name ?? '–'],
          ['Username', username ? `@${username}` : '–'],
          ['Email', user.email ?? '–'],
        ].map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.border }}>
            <Label>{k}</Label>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{v}</Text>
          </View>
        ))}
        <Text style={{ color: c.muted, fontSize: 12 }}>Change your name, username or handicap from the Profile tab.</Text>
      </Card>

      <Card>
        <H2>Change email</H2>
        {pending ? <Message text={`Waiting to confirm ${pending}. Tap the link sent to both your current and new email.`} /> : null}
        <Field label="New email" value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="you@example.com" />
        <Field label="Current password" value={emailPw} onChangeText={setEmailPw} secureTextEntry autoComplete="current-password" textContentType="password" />
        {newEmail && !emailOk ? <Text style={{ color: c.danger, fontSize: 13 }}>That doesn’t look like an email address.</Text> : null}
        {sameEmail ? <Text style={{ color: c.danger, fontSize: 13 }}>That’s already your email.</Text> : null}
        {emailMsg && <Message {...emailMsg} />}
        <Button title={busy === 'email' ? 'Saving…' : 'Change email'} disabled={!emailOk || sameEmail || !emailPw || busy !== null} onPress={saveEmail} />
      </Card>

      <Card>
        <H2>Change password</H2>
        <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" textContentType="password" />
        <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="At least 8 characters" />
        <Field label="New password again" value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        {pwProblem ? <Text style={{ color: c.danger, fontSize: 13 }}>{pwProblem}</Text> : null}
        {pwMsg && <Message {...pwMsg} />}
        <Button title={busy === 'password' ? 'Saving…' : 'Change password'} disabled={!current || next.length < 8 || next !== again || busy !== null} onPress={savePassword} />
      </Card>
    </ScrollView>
  );
}
