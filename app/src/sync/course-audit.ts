/**
 * When a player saves a change to a scorecard (their own copy), the server logs exactly what changed and alerts the
 * Clutch Up team so the card can be reviewed. Best effort: the edit is saved on the phone whatever happens here.
 */
import type { Course } from '@golf/engine';

import { ensureSession } from '@/sync/auth';
import { supabase } from '@/sync/supabase';

export async function reportCourseChange(before: Course, after: Course, method: 'manual' | 'photo') {
  try {
    await ensureSession();
    await supabase.functions.invoke('course-change', { body: { before, after, method } });
  } catch {
    /* offline or signed out: the change still applies on this phone */
  }
}
