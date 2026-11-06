import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { formatIndex } from '@/lib/format';
import { useMe } from '@/lib/me';
import { useStore } from '@/store/store';
import { useSession } from '@/sync/auth';
import { ago, confirmHandicap, isStale } from '@/sync/nudges';
import { radius, space, useColors } from '@/theme';
import { Button, Card } from './ui';

/** Home card: a friend asked me to update my handicap index, or it hasn't been updated in a while. */
export function HandicapReminder() {
  const c = useColors();
  const session = useSession();
  const { me } = useMe();
  const nudges = useStore((s) => s.nudges);
  const at = useStore((s) => s.myHandicapUpdatedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = !!session?.user && !session.user.is_anonymous;
  if (!signedIn || !me) return null;
  const asked = nudges.length > 0;
  if (!asked && (!at || !isStale(at))) return null;

  const names = nudges.map((n) => (n.fromName ?? 'A friend').split(' ')[0]);
  const who = names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
  const stillRight = async () => {
    setBusy(true);
    setError(null);
    try {
      await confirmHandicap();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: c.brandGold }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18 }}>{asked ? '👋' : '⛳'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>
            {asked ? `${who} asked you to update your handicap` : `Is your handicap index still ${formatIndex(me.handicapIndex)}?`}
          </Text>
          <Text style={{ color: c.muted, fontSize: 13 }}>
            {asked ? `It’s ${formatIndex(me.handicapIndex)} on Clutch Up, last updated ${ago(at)}.` : `Last updated ${ago(at)}. Keep it current so matches are fair.`}
          </Text>
        </View>
      </View>
      {error && <Text style={{ color: c.danger, fontSize: 13 }}>{error}</Text>}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Button small title="Update it" onPress={() => router.push({ pathname: '/(tabs)/profile', params: { edit: '1' } })} />
        </View>
        <View style={{ flex: 1, borderRadius: radius.md }}>
          <Button small kind="secondary" title={busy ? 'Saving…' : `Still ${formatIndex(me.handicapIndex)}`} disabled={busy} onPress={stillRight} />
        </View>
      </View>
    </Card>
  );
}
