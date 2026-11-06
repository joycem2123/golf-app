import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { formatIndex } from '@/lib/format';
import { useMe } from '@/lib/me';
import { useStore, type SavedPlayer } from '@/store/store';
import { ensureSession, saveMyProfile } from '@/sync/auth';
import { cancelRequest, removeFriend, respondToRequest, useFriendRequests } from '@/sync/friends';
import { UsernameField, type UsernameStatus } from './username-field';
import { fonts, radius, space, useColors } from '@/theme';
import { PlayerForm, splitName } from './player-form';
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
  // Opened from a handicap reminder: go straight to editing.
  const { edit: editParam } = useLocalSearchParams<{ edit?: string }>();
  const [editing, setEditing] = useState(editParam === '1');
  const myUsername = useStore((s) => s.myUsername);
  const [username, setUsername] = useState('');
  const [uStatus, setUStatus] = useState<UsernameStatus>('empty');
  const [uError, setUError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = (p: SavedPlayer) => {
    upsert(p);
    setMyPlayer(p.id);
    void saveMyProfile(p).catch(() => undefined);
    setEditing(false);
  };

  const claimUsername = async () => {
    if (!me) return;
    setSaving(true);
    setUError(null);
    try {
      await ensureSession();
      await saveMyProfile(me, username);
    } catch (e) {
      setUError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const missingName = !!me && (!splitName(me).first || !splitName(me).last);
  if (missingName && !editing) {
    return (
      <View style={{ gap: space.sm }}>
        <Card style={{ borderLeftWidth: 4, borderLeftColor: c.accent }}>
          <H2>Add your full name</H2>
          <Body muted>RallyCap needs your first and last name so friends can find the right person.</Body>
        </Card>
        <PlayerForm fullName initial={me} onSave={save} />
      </View>
    );
  }

  if (!me || editing) {
    return (
      <View style={{ gap: space.sm }}>
        {!me && (
          <Card style={{ borderLeftWidth: 4, borderLeftColor: c.accent }}>
            <H2>Add yourself</H2>
            <Body muted>Tell RallyCap which player is you, so your rounds and records show up as yours.</Body>
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
        <PlayerForm fullName initial={me} onSave={save} onCancel={me ? () => setEditing(false) : undefined} />
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
          <Body muted>{myUsername ? `@${myUsername} · ` : ''}{me.gender === 'F' ? "Women's tees" : "Men's tees"}</Body>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Label>Index</Label>
          <Text style={{ fontFamily: fonts.serif, fontSize: 26, fontWeight: '700', color: c.primary }}>{formatIndex(me.handicapIndex)}</Text>
        </View>
      </View>
      <Button small kind="secondary" title="Edit my details" onPress={() => setEditing(true)} />
      {!myUsername && (
        <View style={{ gap: space.sm, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.md }}>
          <H2>Choose your username</H2>
          <Body muted>Friends find you by your username. It has to be unique.</Body>
          <UsernameField value={username} onChange={setUsername} onStatus={setUStatus} />
          {uError ? <Body style={{ color: c.danger }}>{uError}</Body> : null}
          <Button small title={saving ? 'Saving…' : 'Save username'} disabled={uStatus !== 'available' || saving} onPress={claimUsername} />
        </View>
      )}
    </Card>
  );
}

/** My friends: everyone else in my saved players. */
export function FriendsList({ onPick }: { onPick?: (id: string) => void }) {
  const c = useColors();
  const { friends, requested } = useMe();
  const upsert = useStore((s) => s.upsertPlayer);
  const remove = useStore((s) => s.removePlayer);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

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
                    <Text style={{ color: c.muted, fontSize: 12 }}>{p.username ? `@${p.username}` : 'Not on RallyCap'}</Text>
                  </View>
                  <Text style={{ fontFamily: fonts.serif, fontSize: 18, fontWeight: '700', color: c.text }}>{formatIndex(p.handicapIndex)}</Text>
                  {!onPick &&
                    (confirming === p.id ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ color: c.danger, fontWeight: '700', fontSize: 13 }}>Remove?</Text>
                        <Button small kind="danger" title="Yes" onPress={() => { setConfirming(null); void removeFriend(p); }} />
                        <Button small kind="ghost" title="No" onPress={() => setConfirming(null)} />
                      </View>
                    ) : (
                      <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${p.name}`} onPress={() => setConfirming(p.id)}>
                        <Text style={{ color: c.muted, fontSize: 18, paddingHorizontal: 4 }}>×</Text>
                      </Pressable>
                    ))}
                </View>
              )}
            </Pressable>
          ),
        )}
      </Card>
      {requested.length > 0 && (
        <Card style={{ paddingVertical: space.sm }}>
          <Label>Waiting for approval</Label>
          {requested.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: c.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{p.name}</Text>
                <Text style={{ color: c.muted, fontSize: 12 }}>{p.username ? `@${p.username} · ` : ''}request sent</Text>
              </View>
              <Button small kind="ghost" title="Cancel" onPress={() => void cancelRequest(p)} />
            </View>
          ))}
        </Card>
      )}
      <Button title="+ Add a friend" kind="secondary" onPress={() => router.push('/add-friend')} />
      <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>Friends on RallyCap keep their own handicap index up to date. Tap anyone else to edit theirs.</Text>
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

/** Requests other people sent me: Accept makes us friends on both sides. */
export function FriendRequestsCard() {
  const c = useColors();
  const { incoming } = useFriendRequests();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (incoming.length === 0) return null;
  const respond = async (r: (typeof incoming)[number], accept: boolean) => {
    setBusy(r.id);
    setError(null);
    try {
      await respondToRequest(r, accept);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: c.accent }}>
      <H2>Friend requests</H2>
      {incoming.map((r, i) => (
        <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: c.primary, fontWeight: '700' }}>{(r.display_name || r.username || '?').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{r.display_name || r.username}</Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>{r.username ? `@${r.username} · ` : ''}wants to be friends</Text>
          </View>
          <Button small title={busy === r.id ? '…' : 'Accept'} disabled={!!busy} onPress={() => respond(r, true)} />
          <Button small kind="ghost" title="Decline" disabled={!!busy} onPress={() => respond(r, false)} />
        </View>
      ))}
      {error ? <Body style={{ color: c.danger }}>{error}</Body> : null}
    </Card>
  );
}

/** Finished rounds that don't know which player was me: tap your name so they count. */
export function UnclaimedRounds() {
  const c = useColors();
  const rounds = useStore((s) => s.rounds);
  const myPlayerId = useStore((s) => s.myPlayerId);
  const meAliases = useStore((s) => s.meAliases);
  const dismissed = useStore((s) => s.identityDismissed);
  const addMeAlias = useStore((s) => s.addMeAlias);
  const dismiss = useStore((s) => s.dismissIdentity);
  if (!myPlayerId) return null;
  const mine = (id: string) => id === myPlayerId || meAliases.includes(id);
  const list = rounds.filter((r) => r.status === 'complete' && !r.players.some((p) => mine(p.id)) && !dismissed.includes(r.id)).slice(0, 5);
  if (list.length === 0) return null;
  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: c.accent }}>
      <H2>Were you in these rounds?</H2>
      <Body muted>Tap your name so the round counts in your stats.</Body>
      {list.map((r) => (
        <View key={r.id} style={{ gap: space.xs, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: c.border }}>
          <Label style={{ letterSpacing: 0.5 }}>{new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {r.players.map((p) => (
              <Button key={p.id} small kind="secondary" title={`I was ${p.name}`} onPress={() => addMeAlias(p.id)} />
            ))}
            <Button small kind="ghost" title="Not me" onPress={() => dismiss(r.id)} />
          </View>
        </View>
      ))}
    </Card>
  );
}
