/** Edit an event's details (name, dates, team names), at any time: before, during or after it. */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Button, Card, Field, Toggle } from '@/components/ui';
import { TeamEditor } from '@/components/team-editor';
import { AddEventPlayer } from '@/components/add-event-player';
import { daysBetween, formatDate } from '@/lib/dates';
import { track } from '@/lib/usage';
import { useEvent, useStore } from '@/store/store';
import { radius, space, teamColor, TEAM_SWATCHES, useColors } from '@/theme';
import { planName } from '@/lib/events';

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
  // Who's on which team (a Ryder Cup's two teams, or the event's teams).
  const [members, setMembers] = useState<Record<string, string>>(() =>
    e?.teams ? Object.fromEntries([...e.teams.A.playerIds.map((id) => [id, 'A']), ...e.teams.B.playerIds.map((id) => [id, 'B'])]) : { ...(e?.teamOf ?? {}) },
  );
  const [applyLive, setApplyLive] = useState(false);
  // Teams as they are now (players just added below included), with my changes on top.
  const liveTeams: Record<string, string> = e?.teams
    ? Object.fromEntries([...e.teams.A.playerIds.map((id) => [id, 'A']), ...e.teams.B.playerIds.map((id) => [id, 'B'])])
    : { ...(e?.teamOf ?? {}) };
  const teamsNow = { ...liveTeams, ...members };
  const saved = useStore((s) => s.players);
  const allRounds = useStore((s) => s.rounds);
  const setRoundTeams = useStore((s) => s.setRoundTeams);
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
      teams: fresh.teams
        ? {
            A: { ...fresh.teams.A, name: teamNames.A?.trim() || 'Team A', playerIds: fresh.playerIds.filter((id) => teamsNow[id] === 'A') },
            B: { ...fresh.teams.B, name: teamNames.B?.trim() || 'Team B', playerIds: fresh.playerIds.filter((id) => teamsNow[id] === 'B') },
          }
        : fresh.teams,
      teamOf: fresh.teamOf ? { ...fresh.teamOf, ...teamsNow } : fresh.teamOf,
      teamNames: letters.length ? Object.fromEntries(Object.entries(teamNames).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])) : fresh.teamNames,
      teamColors: letters.length && Object.keys(teamColors).length ? teamColors : fresh.teamColors,
    });
    // Rounds being played now: only if asked (each round can also be changed from its own Edit teams).
    if (applyLive && letters.length) {
      for (const r of allRounds.filter((x) => x.eventId === e.id && x.status === 'active' && x.teamOf)) {
        const next = { ...r.teamOf };
        for (const p of r.players) if (teamsNow[p.id]) next[p.id] = teamsNow[p.id];
        setRoundTeams(r.id, next);
      }
    }
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
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '700', marginTop: space.sm }}>Players</Text>
          <TeamEditor
            players={e.playerIds.map((id) => ({ id, name: saved.find((p) => p.id === id)?.name ?? 'Player' }))}
            teamOf={teamsNow}
            letters={letters}
            names={teamNames}
            picks={teamColors}
            onChange={setMembers}
          />
          {/* Someone new joining the event: added straight away, on the team picked. */}
          <AddEventPlayer e={e} />
          {allRounds.some((x) => x.eventId === e.id && x.status === 'active') && (
            <Toggle label="Also change rounds being played now" hint="Otherwise only upcoming rounds use the new teams." value={applyLive} onChange={setApplyLive} />
          )}
        </Card>
      )}
      {letters.length === 0 && <AddEventPlayer e={e} />}
      {outside.length > 0 && (
        <View style={{ backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.md }}>
          <Text style={{ color: c.text, fontSize: 13 }}>
            {outside.map((x) => `${planName(x)} (${formatDate(x.date!)})`).join(', ')} {outside.length === 1 ? 'is' : 'are'} outside these dates and keep {outside.length === 1 ? 'its' : 'their'} own date. Tap a round on the event page to move or delete it.
          </Text>
        </View>
      )}
      {problem ? <Text style={{ color: c.danger, textAlign: 'center' }}>{problem}</Text> : null}
      <Button title="Save changes" disabled={!!problem} onPress={save} />
    </ScrollView>
  );
}
