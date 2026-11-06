import type { Course, Tee } from '../types';
import seed from './seed-courses.json';
import willowParkHistory from './willow-park-history.json';

/** Courses bundled with the app (works offline). Replaced by a full course database later. */
export const SEED_COURSES = seed as Course[];

/**
 * Earlier versions of built-in courses. When a course's scorecard is updated, the old card is kept
 * here so rounds played before the change are still scored on the card they were played on.
 * `until` is when the old card stopped being used (ms since 1970).
 */
const COURSE_HISTORY: Record<string, { until: number; course: Course }[]> = {
  'willow-park': willowParkHistory as { until: number; course: Course }[],
};

/** The built-in version of a course that was current at a given time (undefined = use today's). */
export function courseAsOf(id: string, at: number): Course | undefined {
  return (COURSE_HISTORY[id] ?? []).filter((v) => at < v.until).sort((a, b) => a.until - b.until)[0]?.course;
}

/** Problems found in a tee's data; an empty list means it looks valid. */
export function validateTee(tee: Tee): string[] {
  const errors: string[] = [];
  const n = tee.holes.length;
  if (n !== 9 && n !== 18) errors.push(`${tee.name}: has ${n} holes`);
  const sis = tee.holes.map((h) => h.strokeIndex).sort((a, b) => a - b);
  const expected = Array.from({ length: n }, (_, i) => i + 1);
  if (sis.join() !== expected.join()) {
    errors.push(`${tee.name}: stroke indexes must be 1-${n} with no repeats (got ${tee.holes.map((h) => h.strokeIndex).join(', ')})`);
  }
  const parSum = tee.holes.reduce((s, h) => s + h.par, 0);
  if (parSum !== tee.par) errors.push(`${tee.name}: hole pars add up to ${parSum}, tee par is ${tee.par}`);
  if (tee.holes.some((h) => h.par < 3 || h.par > 6)) errors.push(`${tee.name}: a hole has an unusual par`);
  if (tee.slope < 55 || tee.slope > 155) errors.push(`${tee.name}: slope ${tee.slope} is outside 55-155`);
  if (Math.abs(tee.courseRating - tee.par) > 12) errors.push(`${tee.name}: course rating ${tee.courseRating} looks wrong`);
  tee.holes.forEach((h, i) => h.number !== i + 1 && errors.push(`${tee.name}: hole ${i + 1} is numbered ${h.number}`));
  return errors;
}

export function validateCourse(course: Course): string[] {
  const ids = course.tees.map((t) => t.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  return [
    ...(course.tees.length === 0 ? [`${course.name}: no tees`] : []),
    ...dupes.map((id) => `${course.name}: duplicate tee id ${id}`),
    ...course.tees.flatMap(validateTee),
  ];
}

export function findCourse(id: string, courses: Course[] = SEED_COURSES): Course | undefined {
  return courses.find((c) => c.id === id);
}

/** Simple search by name or city for the course picker. */
export function searchCourses(query: string, courses: Course[] = SEED_COURSES): Course[] {
  const q = query.trim().toLowerCase();
  if (!q) return courses;
  return courses.filter((c) => `${c.name} ${c.city ?? ''} ${c.region ?? ''}`.toLowerCase().includes(q));
}
