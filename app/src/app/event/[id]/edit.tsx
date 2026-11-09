/** Edit an event's details (name, dates, team names), at any time: before, during or after it. */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Button, Card, Field } from '@/components/ui';
import { daysBetween, formatDate } from '@/lib/dates';
import { track } from '@/lib/usage';
import { useEvent, useStore } from '@/store/store';
import { radius, space, teamColor, TEAM_SWATCHES, useColors } from '@/theme';

export default function EditEvent() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const e = useEvent(id);
  const updateEvent = useStore((s) => s.updateEvent);
  const [name, setName] = useState(e?.name ?? '');
  const [start, setStart] = useState(e?.startDate ?? '');
  const [end, setEnd] = useState(e?.endDate ?? e?.startDate ?? '');
  // Teams: a Ryder Cup's two, or the event's teams. Names and colours can be changed any time.
  const letters = e?.teams ? ['A', 'B'] : e?.teamOf ? (e.teamLetters ?? []) : [];
  const [teamNames, setTeamNames] = useState<Record<string, string>>(() => ({ ...(e?.teams ? { A: e.teams.A.name, B: e.teams.B.name } : {}), ...e?.teamNames }));
  const [teamColors, setTeamColors] = useState<Record<string, string>>(() => e?.teamColors ?? {});
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
      teams: fresh.teams ? { A: { ...fresh.teams.A, name: teamNames.A?.trim() || 'Team A' }, B: { ...fresh.teams.B, name: teamNames.B?.trim() || 'Team B' } } : fresh.teams,
      teamNames: letters.length ? Object.fromEntries(Object.entries(teamNames).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])) : fresh.teamNames,
      teamColors: letters.length && Object.keys(teamColors).length ? teamColors : fresh.teamColors,
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
      {letters.length > 0 && (
        <Card style={{ gap: space.md }}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>Teams</Text>
          {letters.map((L) => {
            const tc = teamColor(L, teamColors);
            return (
              <View key={L} style={{ gap: 6, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: c.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: tc.color }} />
                  <View style={{ flex: 1 }}>
                    <Field label={`Team ${L} name`} value={teamNames[L] ?? ''} onChangeText={(v) => setTeamNames((n) => ({ ...n, [L]: v }))} placeholder={`Team ${L}`} />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {TEAM_SWATCHES.map((sw) => {
                    const mine = tc.color === sw.color;
                    const taken = !mine && letters.some((o) => o !== L && teamColor(o, teamColors).color === sw.color);
                    return (
                      <Pressable key={sw.id} disabled={taken} onPress={() => setTeamColors((p) => ({ ...p, [L]: sw.id }))} accessibilityRole="button" accessibilityLabel={`${sw.name} for Team ${L}`} accessibilityState={{ selected: mine, disabled: taken }}
                        style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: sw.color, opacity: taken ? 0.2 : 1, alignItems: 'center', justifyContent: 'center', borderWidth: mine ? 3 : 0, borderColor: c.card }}>
                        {mine ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
          <Text style={{ color: c.muted, fontSize: 12 }}>Rounds already started keep the names and colours they began with.</Text>
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
