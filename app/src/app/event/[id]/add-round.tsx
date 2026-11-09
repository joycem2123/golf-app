/** Add a round to an event: today (set it up and play now) or a day in the future (it shows on Home that morning). */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Button } from '@/components/ui';
import { addDays, formatDate, today } from '@/lib/dates';
import { track } from '@/lib/usage';
import { newId, useEvent, useStore } from '@/store/store';
import { radius, space, useColors } from '@/theme';

export default function AddEventRound() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const e = useEvent(id);
  const addEventRound = useStore((s) => s.addEventRound);
  const updateEvent = useStore((s) => s.updateEvent);
  const lastPlanned = (e?.rounds ?? []).map((x) => x.date).filter((d): d is string => !!d).sort().pop();
  const [date, setDate] = useState(() => (lastPlanned && lastPlanned >= today() ? addDays(lastPlanned, e?.recurrence?.every === 'weekly' ? 7 : 1) : today()));
  if (!e) return null;
  const number = (e.rounds?.length ?? 0) + 1;
  const isToday = date === today();
  const outside = (e.endDate && date > e.endDate) || (e.startDate && date < e.startDate);

  const add = () => {
    if (isToday) {
      router.replace({ pathname: '/new-round', params: { eventId: e.id, addRound: '1' } });
      return;
    }
    addEventRound(e.id, { id: newId(), number: 0, date, matchupsLater: true });
    // The event's dates stretch to include the new round.
    if (outside) updateEvent({ ...useStore.getState().events.find((x) => x.id === e.id)!, startDate: e.startDate && date < e.startDate ? date : e.startDate, endDate: e.endDate && date > e.endDate ? date : e.endDate });
    track('event_round_planned', { days_ahead: Math.round((new Date(date).getTime() - new Date(today()).getTime()) / 86400000) });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: c.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>{e.name.toUpperCase()}</Text>
        <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>Round {number}</Text>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <DateField label="When is it?" value={date} onChange={setDate} min={today()} />
      </View>
      <View style={{ backgroundColor: c.primarySoft, borderRadius: radius.md, padding: space.md, gap: 4 }}>
        <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>
          {isToday
            ? 'It’s today: set up the course, players and game now and start playing.'
            : `It’ll be added to the event for ${formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}. That morning it shows on everyone’s Home screen with Start round, where you pick the course, players and game.`}
        </Text>
        {outside && !isToday ? <Text style={{ color: c.muted, fontSize: 13 }}>That’s outside the event’s dates, so they’ll be stretched to include it.</Text> : null}
      </View>
      <Button title={isToday ? 'Set up and start now ›' : `Add Round ${number}`} onPress={add} />
    </ScrollView>
  );
}
