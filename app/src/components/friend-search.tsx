import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { formatIndex } from '@/lib/format';
import { useMe } from '@/lib/me';
import { useStore, type SavedPlayer } from '@/store/store';
import { addFriend, searchProfiles, type ProfileHit } from '@/sync/friends';
import { radius, space, useColors } from '@/theme';
import { PlayerForm } from './player-form';
import { Body, Button, Card } from './ui';

/** Find people on MatchDay as you type, or add someone who isn't on the app. */
export function FriendSearch({ onAdded, onClose }: { onAdded?: (p: SavedPlayer) => void; onClose?: () => void }) {
  const c = useColors();
  const players = useStore((s) => s.players);
  const upsert = useStore((s) => s.upsertPlayer);
  const { isMe } = useMe();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ProfileHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineForm, setOfflineForm] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setHits([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(() => {
      searchProfiles(term)
        .then((r) => { if (!cancelled) { setHits(r); setError(null); } })
        .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
        .finally(() => { if (!cancelled) setBusy(false); });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  if (offlineForm) {
    return (
      <View style={{ gap: space.sm }}>
        <Body muted>Adding someone who isn’t on MatchDay. You can link them later if they join.</Body>
        <PlayerForm
          initial={q.trim() ? { id: '', name: q.trim(), handicapIndex: 0, gender: 'M' } : undefined}
          onCancel={() => setOfflineForm(false)}
          onSave={(p) => {
            const player = { ...p, id: p.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
            upsert(player);
            onAdded?.(player);
            setOfflineForm(false);
            setQ('');
          }}
        />
      </View>
    );
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.chip, borderRadius: radius.sm, borderWidth: 1, borderColor: c.border, paddingHorizontal: space.md }}>
        <Text style={{ color: c.muted, fontSize: 16 }}>⌕</Text>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search by name or @username"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Search friends"
          style={{ flex: 1, color: c.text, fontSize: 16, paddingVertical: 10, paddingHorizontal: space.sm }}
        />
        {busy && <ActivityIndicator color={c.primary} />}
      </View>

      {error ? <Body style={{ color: c.danger }}>{error}</Body> : null}
      {q.trim() !== '' && !busy && !error && hits.length === 0 && <Body muted>No one on MatchDay matches “{q.trim()}”.</Body>}

      {hits.map((h) => {
        const existing = players.find((p) => p.id === h.id);
        const added = !!existing && !isMe(h.id);
        return (
          <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: c.border }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: c.primary, fontWeight: '700' }}>{(h.display_name || h.username).slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{h.display_name || h.username}</Text>
              <Text style={{ color: c.muted, fontSize: 13 }}>@{h.username}{h.handicap_index != null ? ` · ${formatIndex(Number(h.handicap_index))}` : ''}</Text>
            </View>
            {added ? (
              onAdded ? (
                <Button small kind="secondary" title="Add" onPress={() => onAdded(existing!)} />
              ) : (
                <Text style={{ color: c.primary, fontWeight: '700' }}>Friend ✓</Text>
              )
            ) : (
              <Button
                small
                title="Add"
                onPress={async () => {
                  await addFriend(h).catch(() => undefined);
                  const p = useStore.getState().players.find((x) => x.id === h.id);
                  if (p) onAdded?.(p);
                }}
              />
            )}
          </View>
        );
      })}

      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
        <View style={{ flex: 1 }}>
          <Pressable onPress={() => setOfflineForm(true)}>
            <Text style={{ color: c.primary, fontWeight: '600', paddingVertical: 8 }}>Not on MatchDay? Add by name ›</Text>
          </Pressable>
        </View>
        {onClose && <Button small kind="ghost" title="Done" onPress={onClose} />}
      </View>
    </Card>
  );
}
