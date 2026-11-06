import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { formatIndex } from '@/lib/format';
import { useMe } from '@/lib/me';
import { useStore, type SavedPlayer } from '@/store/store';
import { saveMyProfile } from '@/sync/auth';
import { fonts, radius, space, useColors } from '@/theme';
import { PlayerForm } from './player-form';
import { Body, Button, Card, H2, Label } from './ui';

export function MeBadge({ small }: { small?: boolean }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.accent, borderRadius: 3, paddingHorizontal: small ? 4 : 6, paddingVertical: small ? 1 : 2 }}>
      <Text style={{ color: '#fff', fontSize: small ? 9 : 10, fontWeight: '800', letterSpacing: 1 }}>YOU</Text>
    </View>
  );
}

/** Shows my player (or a prompt to add myself), with edit. */
export function MeCard() {
  const c = useColors();
  const { me } = useMe();
  const players = useStore((s) => s.players);
  const upsert = useStore((s) => s.upsertPlayer);
  const setMyPlayer = useStore((s) => s.setMyPlayer);
  const [editing, setEditing] = useState(false);

  const save = (p: SavedPlayer) => {
    upsert(p);
    setMyPlayer(p.id);
    void saveMyProfile(p);
    setEditing(false);
  };

  if (!me || editing) {
    return (
      <View style={{ gap: space.sm }}>
        {!me && (
          <Card style={{ borderLeftWidth: 4, borderLeftColor: c.accent }}>
            <H2>Add yourself</H2>
            <Body muted>Tell MatchDay which player is you, so your rounds and records show up as yours.</Body>
            {players.length > 0 && (
              <>
                <Label>Already in your list?</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {players.map((p) => (
                    <Button key={p.id} small kind="secondary" title={`I'm ${p.name}`} onPress={() => { setMyPlayer(p.id); void saveMyProfile(p); }} />
                  ))}
                </View>
                <Label>Or add yourself</Label>
              </>
            )}
          </Card>
        )}
        <PlayerForm initial={me} onSave={save} onCancel={me ? () => setEditing(false) : undefined} />
      </View>
    );
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.accent }}>
          <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 22, fontWeight: '700' }}>{me.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <H2>{me.name}</H2>
            <MeBadge />
          </View>
          <Body muted>{me.gender === 'F' ? "Women's tees" : "Men's tees"}</Body>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Label>Index</Label>
          <Text style={{ fontFamily: fonts.serif, fontSize: 26, fontWeight: '700', color: c.primary }}>{formatIndex(me.handicapIndex)}</Text>
        </View>
      </View>
      <Button small kind="secondary" title="Edit my details" onPress={() => setEditing(true)} />
    </Card>
  );
}

/** My friends: everyone else in my saved players. */
export function FriendsList({ onPick }: { onPick?: (id: string) => void }) {
  const c = useColors();
  const { friends } = useMe();
  const upsert = useStore((s) => s.upsertPlayer);
  const remove = useStore((s) => s.removePlayer);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <View style={{ gap: space.sm }}>
      <Card style={{ paddingVertical: friends.length ? space.sm : space.lg }}>
        {friends.length === 0 && <Body muted>No friends yet. Add the people you play with.</Body>}
        {friends.map((p, i) =>
          editing === p.id ? (
            <PlayerForm key={p.id} initial={p} onCancel={() => setEditing(null)} onSave={(x) => { upsert(x); setEditing(null); }} />
          ) : (
            <Pressable key={p.id} onPress={onPick ? () => onPick(p.id) : () => setEditing(p.id)}>
              {({ pressed }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: c.border, opacity: pressed ? 0.6 : 1 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: c.primary, fontWeight: '700' }}>{p.name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{p.name}</Text>
                    <Text style={{ color: c.muted, fontSize: 12 }}>{p.gender === 'F' ? "Women's tees" : "Men's tees"}</Text>
                  </View>
                  <Text style={{ fontFamily: fonts.serif, fontSize: 18, fontWeight: '700', color: c.text }}>{formatIndex(p.handicapIndex)}</Text>
                  {!onPick && (
                    <Pressable
                      hitSlop={8}
                      accessibilityLabel={`Remove ${p.name}`}
                      onPress={() => Alert.alert(`Remove ${p.name}?`, 'Past rounds are kept.', [{ text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: () => remove(p.id) }])}>
                      <Text style={{ color: c.muted, fontSize: 18, paddingHorizontal: 4 }}>×</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </Pressable>
          ),
        )}
      </Card>
      {adding ? (
        <PlayerForm onCancel={() => setAdding(false)} onSave={(x) => { upsert(x); setAdding(false); }} />
      ) : (
        <Button title="+ Add a friend" kind="secondary" onPress={() => setAdding(true)} />
      )}
      <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>Tap a friend to update their handicap index.</Text>
    </View>
  );
}

export function StatTiles({ items }: { items: [string, string | number][] }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      {items.map(([label, value]) => (
        <View key={label} style={{ flex: 1, alignItems: 'center', paddingVertical: space.md, backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border }}>
          <Label>{label}</Label>
          <Text style={{ fontFamily: fonts.serif, fontSize: 26, fontWeight: '700', color: c.primary, fontVariant: ['tabular-nums'] }}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

/** On a round/event someone else set up: "Which player are you?" so it counts in my stats. */
export function IdentityCard({ scopeKey, candidates }: { scopeKey: string; candidates: { id: string; name: string }[] }) {
  const c = useColors();
  const { isMe } = useMe();
  const dismissed = useStore((s) => s.identityDismissed.includes(scopeKey));
  const addMeAlias = useStore((s) => s.addMeAlias);
  const dismiss = useStore((s) => s.dismissIdentity);
  if (dismissed || candidates.length === 0 || candidates.some((p) => isMe(p.id))) return null;
  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: c.accent }}>
      <H2>Which player are you?</H2>
      <Body muted>So this counts in your stats and head-to-head records.</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {candidates.map((p) => (
          <Button key={p.id} small kind="secondary" title={p.name} onPress={() => addMeAlias(p.id)} />
        ))}
        <Button small kind="ghost" title="I'm not playing" onPress={() => dismiss(scopeKey)} />
      </View>
    </Card>
  );
}
