import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Body, Button, Card, Field, H2, Label } from '@/components/ui';
import { useMe } from '@/lib/me';
import { useStore } from '@/store/store';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { changeEmail, changePassword, useSession } from '@/sync/auth';
import { deleteMyAccount } from '@/sync/safety';
import { supabase } from '@/sync/supabase';
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
  const [busy, setBusy] = useState<'email' | 'password' | 'delete' | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ id: string; name: string }[]>([]);
  // People I've blocked, with their names.
  useEffect(() => {
    void (async () => {
      const { data: rows } = await supabase.from('blocks').select('blocked');
      const ids = (rows ?? []).map((r) => r.blocked as string);
      if (!ids.length) return setBlocked([]);
      const { data: ps } = await supabase.from('profiles').select('id, display_name, username').in('id', ids);
      setBlocked(ids.map((id) => {
        const pr = ps?.find((x) => x.id === id);
        return { id, name: pr?.display_name ?? (pr?.username ? `@${pr.username}` : 'Someone') };
      }));
    })();
  }, [session?.user?.id]);
  const unblock = async (id: string) => {
    await supabase.rpc('unblock_user', { target: id });
    setBlocked((b) => b.filter((x) => x.id !== id));
  };
  const reallyDelete = async () => {
    setAskDelete(false);
    setBusy('delete');
    setDeleteError(null);
    try {
      await deleteMyAccount();
      router.replace('/welcome');
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  if (session === undefined) return null;
  if (!user || user.is_anonymous) {
    return (
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Card>
          <H2>No account yet</H2>
          <Body muted>You’re using Clutch Up as a guest. Create an account to keep your history and change these details.</Body>
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

      {blocked.length > 0 && (
        <Card>
          <H2>Blocked people</H2>
          {blocked.map((b) => (
            <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text style={{ flex: 1, color: c.text, fontSize: 15 }}>{b.name}</Text>
              <Button small kind="secondary" title="Unblock" onPress={() => unblock(b.id)} />
            </View>
          ))}
        </Card>
      )}

      <Card>
        <H2>Delete account</H2>
        <Text style={{ color: c.muted, fontSize: 14 }}>
          Permanently deletes your Clutch Up account: your profile, friends list, rounds and events you started, shared courses and requests. This can’t be undone.
        </Text>
        {deleteError ? <Message text={deleteError} error /> : null}
        <Button title={busy === 'delete' ? 'Deleting…' : 'Delete my account'} kind="danger" disabled={busy !== null} onPress={() => setAskDelete(true)} />
      </Card>
      <ConfirmDialog
        visible={askDelete}
        title="Delete your account?"
        message={`Everything tied to ${user.email ?? 'your account'} will be deleted for good. Friends keep their copies of rounds you played together.`}
        cancelLabel="Keep my account"
        confirmLabel="Delete forever"
        onCancel={() => setAskDelete(false)}
        onConfirm={reallyDelete}
      />
    </ScrollView>
  );
}
