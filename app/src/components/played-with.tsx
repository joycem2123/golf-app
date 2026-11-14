/**
 * People in this round or event who aren't in my friends list, with an Add button each. Playing with someone
 * doesn't make them a friend; this is where I choose to. Guests go straight into my list; people on Clutch Up get
 * a friend request.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { useMe } from '@/lib/me';
import { useStore, type SavedPlayer } from '@/store/store';
import { befriend } from '@/sync/friends';
import { radius, space, useColors } from '@/theme';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function PlayedWith({ people }: { people: { id: string; name: string; handicapIndex?: number }[] }) {
  const c = useColors();
  const saved = useStore((s) => s.players);
  const { isMe } = useMe();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const list = people
    .filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i && !isMe(p.id))
    .map((p) => ({ p, s: saved.find((x) => x.id === p.id) }))
    .filter(({ s }) => !s || s.notFriend || s.pending);
  if (!list.length) return null;
  const shown = open ? list : list.slice(0, 3);

  const add = async (p: { id: string; name: string; handicapIndex?: number }, s?: SavedPlayer) => {
    setBusy(p.id);
    setError(null);
    try {
      const player: SavedPlayer = s ?? { id: p.id, userId: UUID.test(p.id) ? p.id : undefined, name: p.name, handicapIndex: p.handicapIndex ?? 0, gender: 'M', notFriend: true };
      if (!s) useStore.getState().upsertPlayer(player);
      const r = await befriend(player);
      setDone((d) => ({ ...d, [p.id]: r === 'sent' ? 'Request sent' : 'Added ✓' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t add them just now.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ gap: space.sm }}>
      <Text style={{ color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>PLAYED WITH · NOT IN YOUR FRIENDS</Text>
      {shown.map(({ p, s }) => {
        const status = done[p.id] ?? (s?.pending ? 'Request sent' : null);
        return (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontWeight: '600', fontSize: 15 }}>{s?.name ?? p.name}</Text>
            {status ? (
              <Text style={{ color: c.muted, fontSize: 13, fontWeight: '700' }}>{status}</Text>
            ) : (
              <Pressable onPress={() => void add(p, s)} disabled={busy === p.id} accessibilityRole="button" accessibilityLabel={`Add ${p.name} as a friend`}
                style={({ pressed }) => ({ borderWidth: 1, borderColor: c.primary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, opacity: pressed || busy === p.id ? 0.6 : 1 })}>
                <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13 }}>{busy === p.id ? 'Adding…' : '+ Add friend'}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      {list.length > 3 ? (
        <Pressable onPress={() => setOpen(!open)} hitSlop={6} accessibilityRole="button">
          <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13 }}>{open ? 'Show fewer' : `Show all ${list.length}`}</Text>
        </Pressable>
      ) : null}
      {error ? <Text style={{ color: c.danger, fontSize: 12 }}>{error}</Text> : null}
    </Card>
  );
}
