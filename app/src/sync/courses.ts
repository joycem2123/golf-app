/** Sharing courses I added or corrected with chosen friends. */
import type { Course } from '@golf/engine';

import { useStore } from '@/store/store';
import { supabase } from './supabase';

/** Share a course with exactly these friends (account ids); anyone left out stops getting it. */
export async function shareCourse(course: Course, recipients: string[]) {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) throw new Error('Sign in to share courses.');
  if (recipients.length) {
    const { error } = await supabase
      .from('course_shares')
      .upsert(recipients.map((r) => ({ course_id: course.id, owner: me, recipient: r, data: course, updated_at: new Date().toISOString() })));
    if (error) throw new Error(/fetch|network/i.test(error.message) ? 'No connection. Try again when you have signal.' : 'Couldn’t share the course. You can only share with friends.');
  }
  let del = supabase.from('course_shares').delete().eq('course_id', course.id).eq('owner', me);
  if (recipients.length) del = del.not('recipient', 'in', `(${recipients.join(',')})`);
  await del;
  useStore.getState().setCourseShares(course.id, recipients);
}

/** After I edit a course I've shared, send my friends the new version. */
export async function resendSharedCourse(course: Course) {
  const to = useStore.getState().courseShares?.[course.id];
  if (to?.length) await shareCourse(course, to).catch(() => undefined);
}

/** Bring in courses friends shared with me, and who I've shared mine with. */
export async function pullSharedCourses() {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) return;
  const { data: rows, error } = await supabase.from('course_shares').select('course_id, owner, recipient, data');
  if (error) return;
  const toMe = (rows ?? []).filter((r) => r.recipient === me);
  const owners = [...new Set(toMe.map((r) => r.owner as string))];
  const names: Record<string, string> = {};
  if (owners.length) {
    const { data: ps } = await supabase.from('profiles').select('id, display_name').in('id', owners);
    for (const p of ps ?? []) if (p.display_name) names[p.id] = p.display_name;
  }
  useStore.getState().setSharedCourses(
    Object.fromEntries(toMe.map((r) => [r.course_id, { course: r.data as Course, from: r.owner as string, fromName: names[r.owner] }])),
  );
  const mine: Record<string, string[]> = {};
  for (const r of (rows ?? []).filter((x) => x.owner === me)) (mine[r.course_id] ??= []).push(r.recipient as string);
  for (const [id, ids] of Object.entries(mine)) useStore.getState().setCourseShares(id, ids);
}
