/** Edit an event's details (name, dates, team names), at any time: before, during or after it. */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Button, Card, Field } from '@/components/ui';
import { daysBetween, formatDate } from '@/lib/dates';
import { track } from '@/lib/usage';
import { useEvent, useStore } from '@/store/store';
import { radius, space, useColors } from '@/theme';

export default function EditEvent() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const e = useEvent(id);
  const updateEvent = useStore((s) => s.updateEvent);
  const [name, setName] = useState(e?.name ?? '');
  const [start, setStart] = useState(e?.startDate ?? '');
  const [end, setEnd] = useState(e?.endDate ?? e?.startDate ?? '');
  const [teamNames, setTeamNames] = useState({ A: e?.teams?.A.name ?? 'Team A', B: e?.teams?.B.name ?? 'Team B' });
  if (!e) return null;

  const problem = !name.trim() ? 'Give the event a name.' : start && end && end < start ? 'The end date can’t be before the start date.' : null;
  // Planned rounds that would fall outside the new dates (they keep their own dates).
  const outside = start && end ? (e.rounds ?? []).filter((x) => x.date && (x.date < start || x.date > end)) : [];

  const save = () => {
    if (problem) return;
    const fresh = useStore.getState().events.find((x) => x.id === e.id) ?? e;
    updateEvent({
      ...fresh,
      name: name.trim(),
      startDate: start || fresh.startDate,
      endDate: end || fresh.endDate,
      teams: fresh.teams ? { A: { ...fresh.teams.A, name: teamNames.A.trim() || 'Team A' }, B: { ...fresh.teams.B, name: teamNames.B.trim() || 'Team B' } } : fresh.teams,
    });
    track('event_edited');
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Field label="Event name" value={name} onChangeText={setName} />
      {start ? (
        <Card style={{ gap: space.sm }}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>Dates</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <DateField label="Starts" value={start} onChange={(d) => { setStart(d); if (end && d > end) setEnd(d); }} />
            <DateField label="Ends" value={end} onChange={setEnd} min={start} />
          </View>
          <Text style={{ color: c.muted, fontSize: 13 }}>{daysBetween(start, end).length} day{daysBetween(start, end).length === 1 ? '' : 's'}</Text>
        </Card>
      ) : null}
      {e.teams && (
        <Card style={{ gap: space.sm }}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>Team names</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {(['A', 'B'] as const).map((t) => (
              <View key={t} style={{ flex: 1 }}>
                <Field label={`Team ${t}`} value={teamNames[t]} onChangeText={(v) => setTeamNames((n) => ({ ...n, [t]: v }))} />
              </View>
            ))}
          </View>
        </Card>
      )}
      {outside.length > 0 && (
        <View style={{ backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.md }}>
          <Text style={{ color: c.text, fontSize: 13 }}>
            {outside.map((x) => `Round ${x.number} (${formatDate(x.date!)})`).join(', ')} {outside.length === 1 ? 'is' : 'are'} outside these dates and keep {outside.length === 1 ? 'its' : 'their'} own date. Tap a round on the event page to move or delete it.
          </Text>
        </View>
      )}
      {problem ? <Text style={{ color: c.danger, textAlign: 'center' }}>{problem}</Text> : null}
      <Button title="Save changes" disabled={!!problem} onPress={save} />
    </ScrollView>
  );
}
