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
      setMsg({ text: chosen.length ? `Shared with ${chosen.length} friend${chosen.length === 1 ? '' : 's'}. They’ll see it in their Courses.` : 'No longer shared.' });
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
    <Sheet visible={visible} onClose={() => { setPicked(null); setMsg(null); setQ(''); onClose(); }} title="Share with friends">
      {online.length === 0 ? (
        <Body muted>Add friends on RIVL first (Friends tab), then you can share courses with them.</Body>
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
