import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, TextInput } from 'react-native';

import { Body, Button, Card, Field, Label, Segmented } from '@/components/ui';
import { joinByCode } from '@/sync/sync';
import { fonts, radius, space, useColors } from '@/theme';

export default function Join() {
  const c = useColors();
  const [code, setCode] = useState('');
  const [role, setRole] = useState<'viewer' | 'scorer'>('viewer');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await joinByCode(clean, role, name);
      router.replace(res.kind === 'round' ? `/round/${res.id}` : `/event/${res.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
      <Body muted>Enter the 6-character code from the person who set up the round or event.</Body>
      <TextInput
        value={clean}
        onChangeText={setCode}
        placeholder="ABC123"
        placeholderTextColor={c.border}
        autoCapitalize="characters"
        autoCorrect={false}
        accessibilityLabel="Share code"
        style={{
          fontFamily: fonts.serif, fontSize: 40, letterSpacing: 8, textAlign: 'center', color: c.primary,
          backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, paddingVertical: space.lg,
        }}
      />
      <Card>
        <Label>I want to</Label>
        <Segmented options={[{ value: 'viewer', label: 'Follow the leaderboard' }, { value: 'scorer', label: 'Keep score' }]} value={role} onChange={setRole} />
        <Field label="Your name (shown to the group)" value={name} onChangeText={setName} placeholder="Optional" autoCapitalize="words" />
      </Card>
      {error ? <Body style={{ color: c.danger }}>{error}</Body> : null}
      <Button title={busy ? 'Joining…' : 'Join'} disabled={clean.length !== 6 || busy} onPress={join} />
    </ScrollView>
  );
}
