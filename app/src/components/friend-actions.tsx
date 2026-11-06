import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { SavedPlayer } from '@/store/store';
import { removeFriend } from '@/sync/friends';
import { blockUser, reportUser } from '@/sync/safety';
import { radius, space, useColors } from '@/theme';
import { Sheet } from './round-setup';
import { Body, Button } from './ui';

const REASONS = ['Inappropriate name or photo', 'Harassment or abuse', 'Spam or fake account', 'Something else'];

/** Options for a friend: remove, report or block. */
export function FriendActions({ p, onClose }: { p: SavedPlayer | null; onClose: () => void }) {
  const c = useColors();
  const [mode, setMode] = useState<'menu' | 'remove' | 'report' | 'block' | 'done'>('menu');
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const close = () => { setMode('menu'); setReason(null); setDetails(''); setMsg(null); onClose(); };
  if (!p) return null;
  const first = p.name.split(' ')[0];
  const onApp = !!p.userId;

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ text: done });
      setMode('done');
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const option = (label: string, sub: string, onPress: () => void, danger?: boolean) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ color: danger ? c.danger : c.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: c.muted, fontSize: 13 }}>{sub}</Text>
    </Pressable>
  );

  return (
    <Sheet visible={!!p} onClose={close} title={p.name}>
      {mode === 'menu' && (
        <View>
          {option('Remove friend', onApp ? `You can add ${first} again later.` : 'Take them off your list.', () => setMode('remove'), true)}
          {onApp && option('Report', `Tell us if ${first}’s name or behaviour isn’t OK.`, () => setMode('report'))}
          {onApp && option('Block', `${first} won’t be able to find you, add you or share with you.`, () => setMode('block'), true)}
        </View>
      )}
      {mode === 'remove' && (
        <View style={{ gap: space.md }}>
          <Body>Remove {p.name} from your friends?</Body>
          <Button kind="danger" title={busy ? 'Removing…' : 'Remove'} disabled={busy} onPress={() => run(() => removeFriend(p), `${first} was removed.`)} />
          <Button kind="ghost" title="Cancel" onPress={() => setMode('menu')} />
        </View>
      )}
      {mode === 'report' && (
        <View style={{ gap: space.sm }}>
          <Body>What’s wrong?</Body>
          {REASONS.map((r) => (
            <Pressable key={r} onPress={() => setReason(r)} accessibilityRole="radio" accessibilityState={{ selected: reason === r }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: reason === r ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                {reason === r && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.primary }} />}
              </View>
              <Text style={{ color: c.text, fontSize: 15 }}>{r}</Text>
            </Pressable>
          ))}
          <TextInput value={details} onChangeText={setDetails} placeholder="Anything else we should know (optional)" placeholderTextColor={c.muted} multiline
            style={{ minHeight: 70, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: space.md, color: c.text, backgroundColor: c.chip, textAlignVertical: 'top' }} />
          {msg && <Text style={{ color: msg.error ? c.danger : c.primary }}>{msg.text}</Text>}
          <Button title={busy ? 'Sending…' : 'Send report'} disabled={!reason || busy} onPress={() => run(() => reportUser(p, reason!, details.trim() || undefined), `Thanks. We’ll look into it. You can also block ${first}.`)} />
          <Button kind="ghost" title="Cancel" onPress={() => setMode('menu')} />
        </View>
      )}
      {mode === 'block' && (
        <View style={{ gap: space.md }}>
          <Body>Block {p.name}? They’ll be removed from your friends, won’t be able to find you or send you requests, and any courses you’ve shared with each other stop being shared. Rounds you’ve already played together are kept.</Body>
          {msg && <Text style={{ color: msg.error ? c.danger : c.primary }}>{msg.text}</Text>}
          <Button kind="danger" title={busy ? 'Blocking…' : `Block ${first}`} disabled={busy} onPress={() => run(() => blockUser(p), `${first} is blocked.`)} />
          <Button kind="ghost" title="Cancel" onPress={() => setMode('menu')} />
        </View>
      )}
      {mode === 'done' && (
        <View style={{ gap: space.md, alignItems: 'center', paddingVertical: space.md }}>
          <Text style={{ fontSize: 34 }}>✓</Text>
          <Body style={{ textAlign: 'center' }}>{msg?.text}</Body>
          {msg?.text.includes('also block') && <Button kind="secondary" title={`Block ${first}`} onPress={() => { setMsg(null); setMode('block'); }} />}
          <Button title="Done" onPress={close} />
        </View>
      )}
    </Sheet>
  );
}
