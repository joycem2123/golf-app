import { SEED_COURSES, type Course } from '@golf/engine';

import { useStore } from '@/store/store';

/** Every course, with my edits applied (edited copies replace the built-in ones). */
export function coursesWith(edits: Record<string, Course> | undefined): Course[] {
  return SEED_COURSES.map((c) => edits?.[c.id] ?? c);
}

/** A course by id, with my edits applied. */
export function getCourse(id: string): Course | undefined {
  const edits = useStore.getState().courseEdits;
  return edits?.[id] ?? SEED_COURSES.find((c) => c.id === id);
}

export function useCourses(): Course[] {
  const edits = useStore((s) => s.courseEdits);
  return coursesWith(edits);
}

export const isEdited = (id: string) => !!useStore.getState().courseEdits?.[id];
export const originalCourse = (id: string) => SEED_COURSES.find((c) => c.id === id);
