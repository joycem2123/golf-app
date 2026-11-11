import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, TextInput } from 'react-native';

import { Body, Button, Card, Field, Label, Segmented } from '@/components/ui';
import { joinByCode } from '@/sync/sync';
import { useStore } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';
import { track } from '@/lib/usage';

export default function Join() {
  const c = useColors();
  // A shared link (clutchupgolf.com/join?c=ABC123 → clutchup://join?code=ABC123) fills the code in.
  const params = useLocalSearchParams<{ code?: string; c?: string }>();
  const linked = String(params.code ?? params.c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const [code, setCode] = useState(linked);
  // From a link, join ready to keep score: only the match's own players can enter scores anyway.
  const [role, setRole] = useState<'viewer' | 'scorer'>(linked ? 'scorer' : 'viewer');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(linked.length === 6);
  const [error, setError] = useState<string | null>(null);
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  const join = async (as: 'viewer' | 'scorer' = role) => {
    setBusy(true);
    setError(null);
    try {
      const res = await joinByCode(clean, as, name);
      track('joined_by_code', { kind: res.kind, role });
      router.replace(res.kind === 'round' ? `/round/${res.id}` : `/event/${res.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Opened from a link: go straight to live scoring.
  const started = useRef(false);
  // Wait for saved rounds to load, so a round you already have just opens.
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated());
  useEffect(() => useStore.persist.onFinishHydration(() => setHydrated(true)), []);
  useEffect(() => {
    if (started.current || !hydrated || linked.length !== 6) return;
    started.current = true;
    const st = useStore.getState();
    const round = st.rounds.find((r) => r.remote?.shareCode === linked);
    const event = st.events.find((e) => e.remote?.shareCode === linked);
    if (round) router.replace(`/round/${round.id}`);
    else if (event) router.replace(`/event/${event.id}`);
    else
      joinByCode(linked, 'scorer')
        .then((res) => (track('joined_by_link', { kind: res.kind }), router.replace(res.kind === 'round' ? `/round/${res.id}` : `/event/${res.id}`)))
        .catch((e) => (setError(e instanceof Error ? e.message : String(e)), setBusy(false)));
  }, [linked, hydrated]);

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
      {busy && linked ? <Body style={{ textAlign: 'center', color: c.primary, fontWeight: '700' }}>Opening live scoring…</Body> : null}
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
      <Button title={busy ? 'Joining…' : 'Join'} disabled={clean.length !== 6 || busy} onPress={() => join()} />
    </ScrollView>
  );
}
