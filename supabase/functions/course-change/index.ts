/**
 * A player saved a change to a scorecard (their own copy only). Work out exactly what changed and log it in
 * course_change_log, where the team reviews it in the app (More → Course changes). No notifications are sent.
 *   body: { before: Course, after: Course, method?: 'manual' | 'photo' }
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Hole = { number: number; par: number; strokeIndex: number; yards?: number };
type Tee = { id: string; name: string; gender?: 'M' | 'F'; courseRating: number; slope: number; par: number; holes: Hole[] };
type Course = { id: string; name: string; city?: string; region?: string; tees: Tee[] };
type Change = { tee?: string; gender?: string; field: string; hole?: number; from: unknown; to: unknown };

const teeLabel = (t: Tee) => `${t.name} (${t.gender === 'F' ? 'ladies' : 'men'})`;
const valid = (c: unknown): c is Course => !!c && typeof c === 'object' && typeof (c as Course).id === 'string' && Array.isArray((c as Course).tees);

/** Every difference between the two cards. */
function diff(before: Course, after: Course): Change[] {
  const out: Change[] = [];
  for (const f of ['name', 'city', 'region'] as const) if ((before[f] ?? '') !== (after[f] ?? '')) out.push({ field: f, from: before[f] ?? null, to: after[f] ?? null });
  const old = new Map(before.tees.map((t) => [t.id, t]));
  const now = new Map(after.tees.map((t) => [t.id, t]));
  for (const t of after.tees) {
    const o = old.get(t.id);
    const tee = teeLabel(t);
    if (!o) { out.push({ tee, gender: t.gender, field: 'tee added', from: null, to: `${t.courseRating}/${t.slope}, par ${t.par}` }); continue; }
    if (o.name !== t.name) out.push({ tee, gender: t.gender, field: 'tee name', from: o.name, to: t.name });
    if (o.courseRating !== t.courseRating) out.push({ tee, gender: t.gender, field: 'rating', from: o.courseRating, to: t.courseRating });
    if (o.slope !== t.slope) out.push({ tee, gender: t.gender, field: 'slope', from: o.slope, to: t.slope });
    t.holes.forEach((h, i) => {
      const oh = o.holes[i];
      if (!oh) return;
      if (oh.par !== h.par) out.push({ tee, gender: t.gender, field: 'par', hole: h.number, from: oh.par, to: h.par });
      if (oh.strokeIndex !== h.strokeIndex) out.push({ tee, gender: t.gender, field: 'hole handicap', hole: h.number, from: oh.strokeIndex, to: h.strokeIndex });
      if ((oh.yards ?? null) !== (h.yards ?? null)) out.push({ tee, gender: t.gender, field: 'yards', hole: h.number, from: oh.yards ?? null, to: h.yards ?? null });
    });
  }
  for (const o of before.tees) if (!now.has(o.id)) out.push({ tee: teeLabel(o), gender: o.gender, field: 'tee removed', from: `${o.courseRating}/${o.slope}`, to: null });
  return out;
}

/** "Black (men): rating 70.9 → 71.2, hole 4 par 4 → 5; Silver (men) removed" */
function summarise(changes: Change[]): string {
  const byTee = new Map<string, string[]>();
  for (const c of changes) {
    const key = c.tee ?? 'Course';
    const bit = c.field === 'tee added' ? `added (${c.to})` : c.field === 'tee removed' ? 'removed' : `${c.hole ? `hole ${c.hole} ` : ''}${c.field} ${c.from ?? '–'} → ${c.to ?? '–'}`;
    byTee.set(key, [...(byTee.get(key) ?? []), bit]);
  }
  return [...byTee.entries()].map(([k, bits]) => `${k}: ${bits.length > 6 ? `${bits.slice(0, 6).join(', ')} +${bits.length - 6} more` : bits.join(', ')}`).join('; ');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: who } = await user.auth.getUser();
  const me = who?.user?.id;
  if (!me) return json({ error: 'Sign in first.' }, 401);

  let body: { before?: unknown; after?: unknown; method?: string };
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  if (!valid(body.before) || !valid(body.after) || body.before.id !== body.after.id) return json({ error: 'Bad request' }, 400);
  if (JSON.stringify(body.after).length > 200_000) return json({ error: 'Too large' }, 413);
  const after = body.after;
  const changes = diff(body.before, after);
  if (!changes.length) return json({ ok: true, changes: 0 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: prof } = await admin.from('profiles').select('display_name').eq('id', me).maybeSingle();
  const name = (prof?.display_name as string | undefined)?.trim() || 'A player';
  const method = body.method === 'photo' ? 'photo' : 'manual';
  const summary = summarise(changes);
  const { error } = await admin.from('course_change_log').insert({
    user_id: me, user_name: name, course_id: body.after.id, course_name: body.after.name, method, summary, changes, course_after: body.after,
  });
  if (error) { console.error('log failed', error); return json({ error: 'Couldn’t record the change.' }, 500); }

  // No notifications: the change waits in the team's review inbox in the app (More → Course changes).
  return json({ ok: true, changes: changes.length });
});
