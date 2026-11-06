import { useState } from 'react';
import { Share, Text, View } from 'react-native';

import type { Remote } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';
import { Body, Button, Card, H2, Label } from './ui';
import { track } from '@/lib/usage';

/** Shows the share code, or a button to put the round/event online. */
export function ShareCard({ remote, what, onShare }: { remote?: Remote; what: 'round' | 'event'; onShare: () => Promise<string> }) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (remote?.role === 'viewer') {
    return (
      <Card style={{ borderLeftWidth: 4, borderLeftColor: c.accent }}>
        <Label>Watching live</Label>
        <Body muted>Scores update automatically as the group enters them.</Body>
      </Card>
    );
  }

  if (remote) {
    return (
      <Card style={{ alignItems: 'center' }}>
        <Label>Share code</Label>
        <View style={{ borderWidth: 1, borderColor: c.accent, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
          <Text selectable style={{ fontFamily: fonts.serif, fontSize: 34, letterSpacing: 6, color: c.primary, fontWeight: '700' }}>{remote.shareCode}</Text>
        </View>
        <Body muted style={{ textAlign: 'center' }}>
          Friends tap “Join with code” on the home screen to follow live or keep score{what === 'event' ? ' for any match in this event' : ''}.
        </Body>
        <Button
          small
          kind="secondary"
          title="Send code"
          onPress={() => (track('share_code_shared', { what }), Share.share({ message: `Join my ${what === 'event' ? 'event' : 'round'} in Clutch Up with code ${remote.shareCode}` }))}
        />
      </Card>
    );
  }

  return (
    <Card>
      <H2>Share live</H2>
      <Body muted>
        {what === 'event'
          ? 'Put this event online so every group can score their own match and everyone sees results live.'
          : 'Let friends follow the leaderboard live, or keep score on their own phones.'}
      </Body>
      {error ? <Body style={{ color: c.danger }}>{error}</Body> : null}
      <Button
        small
        title={busy ? 'Sharing…' : what === 'event' ? 'Share this event' : 'Share this round'}
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await onShare();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not share. Check your connection and try again.');
          } finally {
            setBusy(false);
          }
        }}
      />
    </Card>
  );
}
