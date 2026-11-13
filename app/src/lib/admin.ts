/** The Clutch Up team's tools (only shown to admins; the server checks too). */
import { useEffect, useState } from 'react';

import { useSession } from '@/sync/auth';
import { supabase } from '@/sync/supabase';

export interface CourseChange {
  id: number;
  user_name: string | null;
  course_id: string;
  course_name: string;
  method: 'manual' | 'photo';
  summary: string;
  changes: { tee?: string; field: string; hole?: number; from: unknown; to: unknown }[];
  created_at: string;
  reviewed_at: string | null;
  review_note: string | null;
}

/** Am I on the team, and how many course changes are waiting for review. */
export function useAdmin(): { admin: boolean; open: number } {
  const session = useSession();
  const uid = session?.user?.id;
  const [state, setState] = useState<{ uid?: string; admin: boolean; open: number }>({ admin: false, open: 0 });
  useEffect(() => {
    if (!uid || session?.user?.is_anonymous) return;
    let live = true;
    void (async () => {
      const { data: admin } = await supabase.rpc('am_admin');
      if (!admin) { if (live) setState({ uid, admin: false, open: 0 }); return; }
      const { data } = await supabase.rpc('course_changes', { only_open: true });
      if (live) setState({ uid, admin: true, open: (data as unknown[] | null)?.length ?? 0 });
    })();
    return () => { live = false; };
  }, [uid, session?.user?.is_anonymous]);
  return state.uid === uid ? { admin: state.admin, open: state.open } : { admin: false, open: 0 };
}

export async function loadCourseChanges(onlyOpen: boolean): Promise<CourseChange[]> {
  const { data, error } = await supabase.rpc('course_changes', { only_open: onlyOpen });
  if (error) throw new Error('Couldn’t load course changes.');
  return (data ?? []) as CourseChange[];
}

export async function markReviewed(id: number, note: string) {
  const { error } = await supabase.rpc('review_course_change', { change_id: id, note });
  if (error) throw new Error('Couldn’t save the review.');
}
