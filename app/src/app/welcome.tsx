import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogoMark, Wordmark } from '@/components/logo';
import { Body, Button, Card, Field, Segmented } from '@/components/ui';
import { parseIndex } from '@/lib/format';
import { UsernameField, type UsernameStatus } from '@/components/username-field';
import { ensureSession, releaseUsername, restoreMe, saveMyProfile, signIn, signUp } from '@/sync/auth';
import { accountKey, GUEST_KEY, switchAccount } from '@/store/accounts';
import { newId, useStore } from '@/store/store';
import { supabase } from '@/sync/supabase';
import { radius, space, useColors } from '@/theme';

type Mode = 'choose' | 'signIn' | 'signUp' | 'guest';

export default function Welcome() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const setOnboarded = useStore((s) => s.setOnboarded);
  const [mode, setMode] = useState<Mode>('choose');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const name = `${firstName.trim()} ${lastName.trim()}`.trim();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [index, setIndex] = useState('');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const upsertPlayer = useStore((s) => s.upsertPlayer);
  const setMyPlayer = useStore((s) => s.setMyPlayer);
  const parsedIndex = index.trim() ? parseIndex(index) : null;
  const [username, setUsername] = useState('');
  const [uStatus, setUStatus] = useState<UsernameStatus>('empty');
  const setMyUsername = useStore((s) => s.setMyUsername);
  const replaceMyPlayerId = useStore((s) => s.replaceMyPlayerId);
  const existingMe = useStore((s) => s.players.find((p) => p.id === s.myPlayerId));

  /** Create or update "Me" with the given account id. */
  const makeMe = (uid: string | null) => {
    // Read fresh: the account's data may have just been loaded.
    const st = useStore.getState();
    const existingMe = st.players.find((p) => p.id === st.myPlayerId);
    const details = { name, firstName: firstName.trim(), lastName: lastName.trim(), handicapIndex: parsedIndex ?? existingMe?.handicapIndex ?? 0, gender, username };
    if (existingMe) {
      upsertPlayer({ ...existingMe, ...details });
      if (uid && uid !== existingMe.id) replaceMyPlayerId(uid);
    } else {
      const id = uid ?? newId();
      upsertPlayer({ id, userId: uid ?? undefined, ...details });
      setMyPlayer(id);
    }
    setMyUsername(username);
    return useStore.getState().players.find((p) => p.id === useStore.getState().myPlayerId)!;
  };
  const detailsOk = !!firstName.trim() && !!lastName.trim() && uStatus === 'available' && (index.trim() === '' || parsedIndex !== null);
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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.brand }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + space.xl * 2, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.xl }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: space.md, marginBottom: space.xl * 1.5 }}>
          <LogoMark size={150} />
          <Wordmark size={46} color="#FFFFFF" />
          <Text style={{ color: c.brandGold, fontSize: 11, fontWeight: '700', letterSpacing: 1.8, textAlign: 'center' }}>PLAY. COMPETE. REPEAT.</Text>
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
                  const session = await ensureSession().catch(() => null);
                  if (!session) return done(); // offline: set up a username later from Profile
                  if (existingMe) {
                    const [f, ...rest] = existingMe.name.split(' ');
                    setFirstName(existingMe.firstName ?? f ?? '');
                    setLastName(existingMe.lastName ?? rest.join(' '));
                  }
                  setMode('guest');
                })
              }>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', letterSpacing: 0.5 }}>{busy ? 'Starting…' : 'Continue as guest'}</Text>
            </Pressable>
            <Text style={{ color: '#ffffffaa', textAlign: 'center', fontSize: 13 }}>
              Guests can score rounds and follow leaderboards. Create an account any time from Profile to keep your history.
            </Text>
          </View>
        )}

        {mode === 'guest' && (
          <Card style={{ marginTop: 'auto', borderRadius: radius.lg }}>
            <Text style={{ color: c.primary, fontSize: 20, fontWeight: '700' }}>Set up your player</Text>
            <Body muted>Your username lets friends find you and add you to their rounds.</Body>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Field label="First name" value={firstName} onChangeText={setFirstName} placeholder="Joyce" autoCapitalize="words" autoComplete="given-name" />
                  <Field label="Last name" value={lastName} onChangeText={setLastName} placeholder="Smith" autoCapitalize="words" autoComplete="family-name" />
                </View>
            <UsernameField value={username} onChange={setUsername} onStatus={setUStatus} />
            <Field label="Handicap index (optional)" value={index} onChangeText={setIndex} placeholder="12.4 or +1.2" keyboardType="numbers-and-punctuation" />
            <Segmented options={[{ value: 'M', label: "Men's tees" }, { value: 'F', label: "Women's tees" }]} value={gender} onChange={setGender} />
            {message ? <Body style={{ color: message.error ? c.danger : c.primary }}>{message.text}</Body> : null}
            <Button
              title={busy ? 'Saving…' : 'Start playing'}
              disabled={busy || !detailsOk}
              onPress={() =>
                run(async () => {
                  const session = await ensureSession();
                  await saveMyProfile(makeMe(session.user.id), username);
                  done();
                })
              }
            />
            <Button title="Skip for now" kind="ghost" onPress={done} />
          </Card>
        )}

        {(mode === 'signIn' || mode === 'signUp') && (
          <Card style={{ marginTop: 'auto', borderRadius: radius.lg }}>
            <Text style={{ color: c.primary, fontSize: 20, fontWeight: '700' }}>{mode === 'signIn' ? 'Welcome back' : 'Create your account'}</Text>
            {mode === 'signUp' && (
              <>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Field label="First name" value={firstName} onChangeText={setFirstName} placeholder="Joyce" autoCapitalize="words" autoComplete="given-name" />
                  <Field label="Last name" value={lastName} onChangeText={setLastName} placeholder="Smith" autoCapitalize="words" autoComplete="family-name" />
                </View>
                <UsernameField value={username} onChange={setUsername} onStatus={setUStatus} />
                <Field label="Handicap index (optional)" value={index} onChangeText={setIndex} placeholder="12.4 or +1.2" keyboardType="numbers-and-punctuation" />
                <Segmented options={[{ value: 'M', label: "Men's tees" }, { value: 'F', label: "Women's tees" }]} value={gender} onChange={setGender} />
              </>
            )}
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <Field label="Password" value={password} onChangeText={setPassword} placeholder="At least 6 characters" secureTextEntry autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} />
            {message ? <Body style={{ color: message.error ? c.danger : c.primary }}>{message.text}</Body> : null}
            <Button
              title={busy ? 'Please wait…' : mode === 'signIn' ? 'Sign in' : 'Create account'}
              disabled={busy || !email.includes('@') || password.length < 6 || (mode === 'signUp' && !detailsOk)}
              onPress={() =>
                run(async () => {
                  if (mode === 'signIn') {
                    await signIn(email.trim(), password);
                    const { data } = await supabase.auth.getSession();
                    // Load only this account's data (never the previous account's).
                    await switchAccount(accountKey(data.session?.user.id));
                    await restoreMe();
                    return done();
                  }
                  // A guest moving to a full account hands their username over to it.
                  await releaseUsername().catch(() => undefined);
                  const { needsConfirmation, userId } = await signUp(email.trim(), password, name);
                  // A new account gets its own empty data. Only a guest upgrading brings their guest history along.
                  if (userId) await switchAccount(accountKey(userId), { carryFrom: GUEST_KEY });
                  // Create "Me" right away (using my account id so it matches on every phone).
                  const me = makeMe(userId);
                  if (!needsConfirmation) {
                    await saveMyProfile(me, username);
                    return done();
                  }
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
