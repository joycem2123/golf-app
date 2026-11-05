import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { TabHeader } from '@/components/tab-header';
import { Body, Button, Card, Field, H2, Label } from '@/components/ui';
import { saveProfileName, signOut, useSession } from '@/sync/auth';
import { useStore } from '@/store/store';
import { fonts, space, useColors } from '@/theme';

export default function Profile() {
  const c = useColors();
  const session = useSession();
  const names = useStore((s) => s.names);
  const rounds = useStore((s) => s.rounds);
  const history = useStore((s) => s.history);
  const setOnboarded = useStore((s) => s.setOnboarded);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  const user = session?.user;
  const guest = !user || user.is_anonymous;
  const display = user ? (names[user.id] ?? (user.user_metadata?.name as string | undefined)) : undefined;
  const finished = rounds.filter((r) => r.status === 'complete').length;

  return (
    <View style={{ flex: 1 }}>
      <TabHeader title={display ?? (guest ? 'Guest' : 'Profile')} sub={guest ? 'Playing as a guest' : user?.email} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {[
            ['Rounds', finished],
            ['Matches', history.length],
          ].map(([label, value]) => (
            <Card key={label} style={{ flex: 1, alignItems: 'center', paddingVertical: space.md }}>
              <Label>{label}</Label>
              <Text style={{ fontFamily: fonts.serif, fontSize: 28, fontWeight: '700', color: c.primary }}>{value}</Text>
            </Card>
          ))}
        </View>

        {guest ? (
          <Card>
            <H2>Save your history</H2>
            <Body muted>Create an account so your rounds, events and records follow you to any phone.</Body>
            <Button title="Create account or sign in" onPress={() => { setOnboarded(false); router.replace('/welcome'); }} />
          </Card>
        ) : (
          <Card>
            <H2>Display name</H2>
            <Body muted>Shown to your group when you keep score.</Body>
            <Field label="Name" value={name} onChangeText={(v) => { setName(v); setSaved(false); }} placeholder={display ?? 'Your name'} />
            <Button small kind="secondary" title={saved ? 'Saved ✓' : 'Save'} disabled={!name.trim()} onPress={async () => { await saveProfileName(name); setSaved(true); }} />
          </Card>
        )}

        <Card>
          <H2>Handicap</H2>
          <Body muted>Golf Canada linking is coming. For now, keep each player’s index up to date in Players.</Body>
          <Button small kind="secondary" title="Open Players" onPress={() => router.push('/players')} />
        </Card>

        {!guest && (
          <Button
            title="Sign out"
            kind="ghost"
            onPress={async () => {
              await signOut();
              setOnboarded(false);
              router.replace('/welcome');
            }}
          />
        )}
      </ScrollView>
    </View>
  );
}
