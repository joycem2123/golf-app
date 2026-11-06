import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { formatIndex } from '@/lib/format';
import { useMe } from '@/lib/me';
import type { SavedPlayer } from '@/store/store';
import { useSession } from '@/sync/auth';
import { pullFriends } from '@/sync/friends';
import { ago, askToUpdate, isStale } from '@/sync/nudges';
import { radius, space, useColors } from '@/theme';
import { Button, Card, H2 } from './ui';

/**
 * On the players step: who in the group hasn't updated their handicap index lately,
 * with a button to ask them to, and one to pull everyone's latest index.
 */
export function HandicapCheck({ players }: { players: SavedPlayer[] }) {
  const c = useColors();
  const session = useSession();
  const { isMe } = useMe();
  const [busy, setBusy] = useState<'ask' | 'refresh' | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const signedIn = !!session?.user && !session.user.is_anonymous;
  // Friends on Clutch Up whose index is more than two weeks old (only once we know when they last updated it).
  const stale = players.filter((p) => p.userId && !isMe(p.id) && !p.pending && p.handicapUpdatedAt && isStale(p.handicapUpdatedAt));
  if (!signedIn || stale.length === 0) return null;

  const first = (p: SavedPlayer) => p.name.split(' ')[0];
  const list = (ps: SavedPlayer[]) => (ps.length <= 2 ? ps.map(first).join(' and ') : `${ps.slice(0, -1).map(first).join(', ')} and ${first(ps[ps.length - 1])}`);

  const ask = async () => {
    setBusy('ask');
    setMsg(null);
    try {
      const { sent, skipped } = await askToUpdate(stale.map((p) => p.userId!));
      const sentTo = stale.filter((p) => sent.includes(p.userId!));
      const already = stale.filter((p) => skipped.includes(p.userId!));
      setMsg({
        text: [
          sentTo.length ? `Asked ${list(sentTo)}. Tap Refresh once they’ve updated.` : '',
          already.length ? `${list(already)} ${already.length === 1 ? 'was' : 'were'} already asked recently.` : '',
        ].filter(Boolean).join(' '),
      });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(null);
    }
  };
  const refresh = async () => {
    setBusy('refresh');
    setMsg(null);
    await pullFriends().catch(() => undefined);
    setBusy(null);
    setMsg({ text: 'Handicaps refreshed.' });
  };

  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: c.brandGold }}>
      <H2>Handicaps to check</H2>
      <Text style={{ color: c.muted, fontSize: 13 }}>Not updated in over two weeks:</Text>
      {stale.map((p) => (
        <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
          <Text style={{ flex: 1, color: c.text, fontSize: 15, fontWeight: '600' }}>{p.name}</Text>
          <Text style={{ color: c.text, fontWeight: '700', marginRight: space.sm }}>{formatIndex(p.handicapIndex)}</Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>{ago(p.handicapUpdatedAt)}</Text>
        </View>
      ))}
      {msg && (
        <View style={{ backgroundColor: msg.error ? '#FBEDEC' : c.primarySoft, borderRadius: radius.md, padding: space.sm }}>
          <Text style={{ color: msg.error ? c.danger : c.primary, fontSize: 13 }}>{msg.text}</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Button small title={busy === 'ask' ? 'Sending…' : stale.length === 1 ? `Ask ${first(stale[0])} to update` : `Ask all ${stale.length} to update`} disabled={!!busy} onPress={ask} />
        </View>
        <View style={{ width: 110 }}>
          {busy === 'refresh' ? <ActivityIndicator color={c.primary} /> : <Button small kind="secondary" title="Refresh" disabled={!!busy} onPress={refresh} />}
        </View>
      </View>
    </Card>
  );
}
