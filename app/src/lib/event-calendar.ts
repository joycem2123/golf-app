/**
 * The event calendar: which planned rounds (and scheduled matches) are on today, whether one can be started,
 * and what's coming up next (for the countdowns).
 */
import { fromISODate, today } from '@/lib/dates';
import type { EventRecord, RoundRecord } from '@/store/store';

/** Something in an event that's planned for a day and hasn't been started. */
export type PlannedItem = {
  event: EventRecord;
  /** A planned round (Round 2) or a scheduled match. */
  kind: 'round' | 'match';
  id: string;
  date: string;
  title: string;
  /** Where Start goes. */
  params: Record<string, string>;
};

const started = (roundId: string | undefined, rounds: RoundRecord[]) => !!roundId && rounds.some((r) => r.id === roundId);

/** Every planned, not-yet-started round and match in events I can score. */
export function plannedItems(events: EventRecord[], rounds: RoundRecord[]): PlannedItem[] {
  const out: PlannedItem[] = [];
  for (const e of events) {
    if (e.status === 'complete' || e.remote?.role === 'viewer') continue;
    for (const x of e.rounds ?? []) {
      if (!x.date || started(x.roundId, rounds)) continue;
      out.push({ event: e, kind: 'round', id: x.id, date: x.date, title: `Round ${x.number}`, params: { eventId: e.id, eventRound: x.id } });
    }
    for (const m of e.schedule ?? []) {
      if (!m.date || started((m as { roundId?: string }).roundId, rounds)) continue;
      out.push({ event: e, kind: 'match', id: m.id, date: m.date, title: m.label ?? 'Match', params: { eventId: e.id, matchId: m.id } });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Planned for today: shown on Home with "Start round". */
export const plannedToday = (events: EventRecord[], rounds: RoundRecord[]) => plannedItems(events, rounds).filter((x) => x.date === today());

/** A planned round or match can only be started on its day (no date set = any day). */
export const canStartOn = (date: string | undefined) => !date || date === today();

/** What the next countdown is to: an event that hasn't begun, or the next planned round. */
export type CountdownTarget = { event: EventRecord; label: string; date: string; kind: 'event' | 'round' };

export function nextCountdown(events: EventRecord[], rounds: RoundRecord[]): CountdownTarget | null {
  const t = today();
  const options: CountdownTarget[] = [];
  for (const e of events) {
    if (e.status === 'complete' || !e.startDate) continue;
    if (e.startDate > t) options.push({ event: e, label: e.name, date: e.startDate, kind: 'event' });
  }
  for (const x of plannedItems(events, rounds)) {
    if (x.date > t && !(x.event.startDate && x.event.startDate > t)) options.push({ event: x.event, label: `${x.event.name} · ${x.title}`, date: x.date, kind: 'round' });
  }
  options.sort((a, b) => a.date.localeCompare(b.date));
  return options[0] ?? null;
}

/** The countdown for an event's page: to its start, or to its next planned round. */
export function eventCountdown(e: EventRecord, rounds: RoundRecord[]): CountdownTarget | null {
  const t = today();
  if (e.status === 'complete') return null;
  if (e.startDate && e.startDate > t) return { event: e, label: e.name, date: e.startDate, kind: 'event' };
  const next = plannedItems([e], rounds).find((x) => x.date > t);
  return next ? { event: e, label: next.title, date: next.date, kind: 'round' } : null;
}

/** Milliseconds until the start of that day (local time). */
export const msUntil = (date: string) => fromISODate(date).getTime() - Date.now();
