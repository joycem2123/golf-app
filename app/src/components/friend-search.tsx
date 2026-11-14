import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { formatIndex } from '@/lib/format';
import { useMe } from '@/lib/me';
import { useStore, type SavedPlayer } from '@/store/store';
import { respondToRequest, searchProfiles, sendFriendRequest, useFriendRequests, type ProfileHit } from '@/sync/friends';
import { radius, space, useColors } from '@/theme';
import { PlayerForm } from './player-form';
import { Body, Button, Card } from './ui';
import { track } from '@/lib/usage';

/** Find people on Clutch Up as you type, or add someone who isn't on the app. */
export function FriendSearch({ onAdded, onClose, initialQuery, asFriend = true }: { onAdded?: (p: SavedPlayer) => void; onClose?: () => void; initialQuery?: string; /** A guest added to a round or event (not the friends list) stays off my friends list. */ asFriend?: boolean }) {
  const c = useColors();
  const players = useStore((s) => s.players);
  const upsert = useStore((s) => s.upsertPlayer);
  const { isMe } = useMe();
  const [q, setQ] = useState(initialQuery ?? '');
  const [hits, setHits] = useState<ProfileHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineForm, setOfflineForm] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const { incoming, outgoing } = useFriendRequests();

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
        <Body muted>Adding someone who isn’t on Clutch Up. You can link them later if they join.</Body>
        <PlayerForm
          initial={q.trim() ? { id: '', name: q.trim(), handicapIndex: 0, gender: 'M' } : undefined}
          onCancel={() => setOfflineForm(false)}
          onSave={(p) => {
            const player = { ...p, id: p.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, notFriend: asFriend ? undefined : true };
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
      {q.trim() !== '' && !busy && !error && hits.length === 0 && <Body muted>No one on Clutch Up matches “{q.trim()}”.</Body>}

      {hits.map((h) => {
        const existing = players.find((p) => p.id === h.id);
        const friend = !!existing && !existing.pending && !isMe(h.id);
        const requested = !!existing?.pending || outgoing.some((r) => r.other_id === h.id);
        const theyAsked = incoming.find((r) => r.other_id === h.id);
        const act = async (fn: () => Promise<unknown>) => {
          setActing(h.id);
          try {
            await fn();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setActing(null);
          }
        };
        let action: React.ReactNode;
        if (onAdded) {
          // Picking players for a round/event: add them now; ask to be friends if we aren't yet.
          action = (
            <Button
              small
              title={acting === h.id ? '…' : 'Add'}
              onPress={() =>
                act(async () => {
                  if (!friend && !requested) await sendFriendRequest(h);
                  else if (theyAsked) await respondToRequest(theyAsked, true);
                  const p = useStore.getState().players.find((x) => x.id === h.id);
                  if (p) onAdded(p);
                })
              }
            />
          );
        } else if (friend) action = <Text style={{ color: c.primary, fontWeight: '700' }}>Friend ✓</Text>;
        else if (theyAsked) action = <Button small title={acting === h.id ? '…' : 'Accept'} onPress={() => act(() => respondToRequest(theyAsked, true))} />;
        else if (requested) action = <Text style={{ color: c.muted, fontWeight: '700' }}>Requested</Text>;
        else action = <Button small title={acting === h.id ? '…' : 'Add friend'} onPress={() => act(() => sendFriendRequest(h).then((r) => (track('friend_request_sent'), r)))} />;

        return (
          <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: c.border }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: c.primary, fontWeight: '700' }}>{(h.display_name || h.username).slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{h.display_name || h.username}</Text>
              <Text style={{ color: c.muted, fontSize: 13 }}>
                @{h.username}
                {h.handicap_index != null ? ` · ${formatIndex(Number(h.handicap_index))}` : ''}
                {onAdded && requested ? ' · requested' : ''}
                {theyAsked && !onAdded ? ' · wants to be friends' : ''}
              </Text>
            </View>
            {action}
          </View>
        );
      })}

      {hits.some((h) => !players.some((p) => p.id === h.id && !p.pending)) && !onAdded ? (
        <Text style={{ color: c.muted, fontSize: 12 }}>They’ll get a friend request and appear in your friends once they accept.</Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
        <View style={{ flex: 1 }}>
          <Pressable onPress={() => setOfflineForm(true)}>
            <Text style={{ color: c.primary, fontWeight: '600', paddingVertical: 8 }}>Not on Clutch Up? Add by name ›</Text>
          </Pressable>
        </View>
        {onClose && <Button small kind="ghost" title="Done" onPress={onClose} />}
      </View>
    </Card>
  );
}
