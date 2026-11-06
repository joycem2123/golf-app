import { useState } from 'react';
import { View } from 'react-native';

import { claimLegacy, dismissLegacy, useLegacy } from '@/store/accounts';
import { useStore } from '@/store/store';
import { restoreMe } from '@/sync/auth';
import { supabase } from '@/sync/supabase';
import { space, useColors } from '@/theme';
import { Body, Button, Card, H2 } from './ui';

/** One-time question about data saved on this phone before each account had its own. */
export function LegacyClaimCard() {
  const c = useColors();
  const legacy = useLegacy();
  const dismissed = useStore((s) => s.legacyDismissed);
  const [busy, setBusy] = useState(false);
  if (!legacy.available || dismissed) return null;

  const parts = [
    legacy.rounds ? `${legacy.rounds} round${legacy.rounds === 1 ? '' : 's'}` : null,
    legacy.events ? `${legacy.events} event${legacy.events === 1 ? '' : 's'}` : null,
    legacy.players ? `${legacy.players} player${legacy.players === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  const claim = async () => {
    setBusy(true);
    try {
      await claimLegacy();
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      const st = useStore.getState();
      st.setMe(uid);
      st.setOnboarded(true);
      st.setLegacyDismissed(false);
      // If "Me" in that data belongs to a different account, drop it and rebuild mine from my account.
      const me = st.players.find((p) => p.id === st.myPlayerId);
      if (me?.userId && me.userId !== uid) {
        st.removePlayer(me.id);
        st.setMyPlayer(null);
        st.setMyUsername(null);
      }
      await restoreMe().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: c.accent }}>
      <H2>Is this yours?</H2>
      <Body muted>
        This phone has {parts.join(', ')} saved before each account got its own data. If they’re yours, move them into this account. Otherwise
        they stay put for whoever they belong to.
      </Body>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}><Button small title={busy ? 'Moving…' : 'Yes, they’re mine'} disabled={busy} onPress={claim} /></View>
        <View style={{ flex: 1 }}><Button small kind="secondary" title="Not mine" disabled={busy} onPress={dismissLegacy} /></View>
      </View>
    </Card>
  );
}
