/**
 * The online course database (GolfCourseAPI, through our course-catalog function): find courses the app doesn't
 * have yet and bring one in. A course brought in is saved on this phone like a course I added.
 */
import { validateCourse, type Course } from '@golf/engine';

import { useStore } from '@/store/store';
import { ensureSession } from '@/sync/auth';
import { supabase } from '@/sync/supabase';

export interface CatalogHit {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  country: string;
}

async function call<T>(body: object): Promise<T> {
  await ensureSession();
  const { data, error } = await supabase.functions.invoke('course-catalog', { body });
  if (error) {
    let msg = 'Online course search isn’t available right now.';
    try { msg = ((await (error as { context?: Response }).context?.json()) as { error?: string })?.error ?? msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  return data as T;
}

export async function searchCatalog(q: string): Promise<CatalogHit[]> {
  const { courses } = await call<{ courses: CatalogHit[] }>({ action: 'search', q });
  return courses ?? [];
}

/** Bring a course in from the online database and keep it on this phone. */
export async function importCatalogCourse(id: string): Promise<Course> {
  const { course } = await call<{ course: Course }>({ action: 'get', id });
  if (!course) throw new Error('Couldn’t load that course.');
  useStore.getState().saveCourse(course, course);
  return course;
}

/** Courses still missing something the scoring needs (e.g. stroke indexes) can't be played until they're fixed. */
export const needsFixing = (c: Course) => validateCourse(c).length > 0;
