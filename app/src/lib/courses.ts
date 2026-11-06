import { SEED_COURSES, type Course } from '@golf/engine';

import { useStore } from '@/store/store';

type Shared = Record<string, { course: Course; from: string; fromName?: string }> | undefined;

/** Every course: built-in ones (my edits first, then a friend's shared correction), then ones added by me or shared with me. */
export function coursesWith(edits: Record<string, Course> | undefined, shared?: Shared): Course[] {
  const seedIds = new Set(SEED_COURSES.map((c) => c.id));
  const base = SEED_COURSES.map((c) => edits?.[c.id] ?? shared?.[c.id]?.course ?? c);
  const mine = Object.values(edits ?? {}).filter((c) => !seedIds.has(c.id));
  const fromFriends = Object.values(shared ?? {}).map((x) => x.course).filter((c) => !seedIds.has(c.id) && !edits?.[c.id]);
  return [...base, ...[...mine, ...fromFriends].sort((a, b) => a.name.localeCompare(b.name))];
}

/** A course by id, with my edits (or a friend's shared version) applied. */
export function getCourse(id: string): Course | undefined {
  const st = useStore.getState();
  return st.courseEdits?.[id] ?? st.sharedCourses?.[id]?.course ?? SEED_COURSES.find((c) => c.id === id);
}

export function useCourses(): Course[] {
  const edits = useStore((s) => s.courseEdits);
  const shared = useStore((s) => s.sharedCourses);
  return coursesWith(edits, shared);
}

/** A course not built into the app (added by me or a friend). */
export const isAddedCourse = (id: string) => !SEED_COURSES.some((c) => c.id === id);
export const isEdited = (id: string) => !!useStore.getState().courseEdits?.[id];
export const originalCourse = (id: string) => SEED_COURSES.find((c) => c.id === id);
