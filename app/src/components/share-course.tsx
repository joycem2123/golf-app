import type { Course } from '@golf/engine';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useMe } from '@/lib/me';
import { useStore } from '@/store/store';
import { shareCourse } from '@/sync/courses';
import { radius, space, useColors } from '@/theme';
import { Sheet } from './round-setup';
import { Body, Button } from './ui';

/** Pick which friends get a course: type names, or choose all friends. */
/** Shared empty list (a new [] in a store selector would redraw forever). */
const NONE: string[] = [];

export function ShareCourseSheet({ course, visible, onClose }: { course: Course; visible: boolean; onClose: () => void }) {
  const c = useColors();
  const { friends } = useMe();
  const online = friends.filter((f) => f.userId);
  const current = useStore((s) => s.courseShares?.[course.id] ?? NONE);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  // After saving: who it went to (shown as a success screen).
  const [done, setDone] = useState<{ names: string[]; stopped: boolean } | null>(null);
  const chosen = picked ?? current;
  const all = online.length > 0 && online.every((f) => chosen.includes(f.userId!));
  const term = q.trim().toLowerCase();
  const list = online.filter((f) => !term || f.name.toLowerCase().includes(term) || (f.username ?? '').toLowerCase().includes(term));
  const toggle = (uid: string) => setPicked(chosen.includes(uid) ? chosen.filter((x) => x !== uid) : [...chosen, uid]);
  const changed = chosen.length !== current.length || chosen.some((x) => !current.includes(x));

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await shareCourse(course, chosen);
      setDone({ names: online.filter((f) => chosen.includes(f.userId!)).map((f) => f.name), stopped: chosen.length === 0 });
      setPicked(null);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const row = (key: string, label: string, sub: string | undefined, on: boolean, onPress: () => void) => (
    <Pressable key={key} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : c.card, alignItems: 'center', justifyContent: 'center' }}>
        {on && <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
        {sub ? <Text style={{ color: c.muted, fontSize: 12 }}>{sub}</Text> : null}
      </View>
    </Pressable>
  );

  return (
    <Sheet visible={visible} onClose={() => { setPicked(null); setMsg(null); setDone(null); setQ(''); onClose(); }} title={done ? (done.stopped ? 'Sharing stopped' : 'Course shared') : 'Share with friends'}>
      {done ? (
        <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.lg }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: done.stopped ? c.chip : c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: done.stopped ? c.muted : '#fff', fontSize: 38, fontWeight: '900' }}>{done.stopped ? '–' : '✓'}</Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '700', color: c.text, textAlign: 'center' }}>
            {done.stopped ? `${course.name} is no longer shared` : `${course.name} is shared!`}
          </Text>
          {!done.stopped && (
            <>
              <Text style={{ color: c.text, fontSize: 15, textAlign: 'center' }}>
                Sent to {done.names.length <= 3 ? done.names.join(', ').replace(/, ([^,]*)$/, ' and $1') : `${done.names.slice(0, 2).join(', ')} and ${done.names.length - 2} others`}.
              </Text>
              <Text style={{ color: c.muted, fontSize: 13, textAlign: 'center' }}>It’s in their Courses next time they open Clutch Up, and they’ll get any changes you make.</Text>
            </>
          )}
          <View style={{ alignSelf: 'stretch', gap: space.sm, marginTop: space.sm }}>
            <Button title="Done" onPress={() => { setDone(null); setQ(''); onClose(); }} />
            <Button title="Change who it’s shared with" kind="ghost" onPress={() => setDone(null)} />
          </View>
        </View>
      ) : online.length === 0 ? (
        <Body muted>Add friends on Clutch Up first (Friends tab), then you can share courses with them.</Body>
      ) : (
        <View style={{ gap: space.sm }}>
          <Text style={{ color: c.muted, fontSize: 13 }}>They’ll get {course.name} in their Courses. If you change it later, they get the update.</Text>
          {row('all', `All friends (${online.length})`, undefined, all, () => setPicked(all ? [] : online.map((f) => f.userId!)))}
          <TextInput value={q} onChangeText={setQ} placeholder="Type a friend’s name" placeholderTextColor={c.muted} autoCorrect={false}
            style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: space.md, fontSize: 16, color: c.text, backgroundColor: c.chip, marginTop: space.xs }} />
          {list.map((f) => row(f.id, f.name, f.username ? `@${f.username}` : undefined, chosen.includes(f.userId!), () => toggle(f.userId!)))}
          {list.length === 0 && <Body muted>No friends match “{q.trim()}”.</Body>}
          {msg && <Text style={{ color: msg.error ? c.danger : c.primary, fontSize: 14 }}>{msg.text}</Text>}
          <Button
            title={busy ? 'Sharing…' : chosen.length === 0 ? (current.length ? 'Stop sharing' : 'Pick friends to share with') : `Share with ${chosen.length} friend${chosen.length === 1 ? '' : 's'}`}
            disabled={busy || !changed}
            onPress={save}
          />
        </View>
      )}
    </Sheet>
  );
}
