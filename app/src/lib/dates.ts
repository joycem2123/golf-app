/** Dates are stored as local YYYY-MM-DD strings and times as 24-hour HH:MM. */
export const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const today = () => toISODate(new Date());

export function formatDate(s: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }): string {
  return fromISODate(s).toLocaleDateString(undefined, opts);
}

export function formatTime(t?: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${pad(m)}${suffix}`;
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function addDays(s: string, n: number): string {
  const d = fromISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Every date from start to end, inclusive. */
export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface Recurrence {
  every: 'weekly' | 'biweekly' | 'monthly';
  /** Days of the week, 0 = Sunday. */
  days: number[];
  /** Monthly only: which week of the month (1–4, or -1 for the last). */
  week?: number;
}

/** The dates a repeating schedule lands on between start and end. */
export function occurrences(start: string, end: string, rec: Recurrence): string[] {
  if (!rec.days.length || end < start) return [];
  const all = daysBetween(start, end);
  // Every-2-weeks counts from the week of the first round on or after the start.
  const first = all.find((s) => rec.days.includes(fromISODate(s).getDay()));
  if (!first) return [];
  const anchor = addDays(first, -fromISODate(first).getDay());
  return all.filter((s) => {
    const d = fromISODate(s);
    const dow = d.getDay();
    if (!rec.days.includes(dow)) return false;
    if (rec.every === 'weekly') return true;
    if (rec.every === 'biweekly') {
      const weeks = Math.round((fromISODate(addDays(s, -dow)).getTime() - fromISODate(anchor).getTime()) / (7 * 86400000));
      return weeks % 2 === 0;
    }
    const week = rec.week ?? 1;
    if (week === -1) return d.getDate() + 7 > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return Math.ceil(d.getDate() / 7) === week;
  });
}

const ORD = ['', 'first', 'second', 'third', 'fourth'];
/** "Every week on Tuesday and Thursday", "Every 2 weeks on Saturday", "Monthly on the last Sunday". */
export function describeRecurrence(rec: Recurrence): string {
  const days = [...rec.days].sort().map((d) => WEEKDAY_NAMES[d]);
  const list = days.length > 1 ? `${days.slice(0, -1).join(', ')} and ${days.at(-1)}` : (days[0] ?? '…');
  if (rec.every === 'weekly') return `Every week on ${list}`;
  if (rec.every === 'biweekly') return `Every 2 weeks on ${list}`;
  return `Monthly on the ${rec.week === -1 ? 'last' : ORD[rec.week ?? 1]} ${list}`;
}
