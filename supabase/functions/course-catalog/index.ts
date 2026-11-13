/**
 * Online course lookup (GolfCourseAPI), for courses the app doesn't have yet.
 *   { action: 'search', q }  → matching courses (name and place only)
 *   { action: 'get', id }    → one course in the app's format (tees, ratings, every hole)
 * Every search and course is fetched from the provider once, then kept in catalog_searches / catalog_courses for
 * everyone. The provider key stays here, on the server (GOLFCOURSEAPI_KEY).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const API = 'https://api.golfcourseapi.com/v1';
const SEARCH_TTL_DAYS = 30;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type ApiHole = { par: number; yardage?: number; handicap?: number | null };
type ApiTee = { tee_name: string; course_rating?: number; slope_rating?: number; par_total?: number; holes?: ApiHole[] };
type ApiCourse = { id: string | number; club_name?: string; course_name?: string; location?: { city?: string; state?: string; country?: string }; tees?: { male?: ApiTee[]; female?: ApiTee[] } | Record<string, number> };

const COUNTRY: Record<string, string> = { canada: 'CA', 'united states': 'US', usa: 'US' };
const country = (c?: string) => (c ? COUNTRY[c.toLowerCase()] ?? c : 'US');
const title = (c: ApiCourse) => {
  const club = (c.club_name ?? '').trim();
  const course = (c.course_name ?? '').trim();
  return !course || course.toLowerCase() === club.toLowerCase() ? club || course : club ? `${club} – ${course}` : course;
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const appId = (sourceId: string | number) => `gca-${sourceId}`;

/** The provider's course in the app's own format. */
function toAppCourse(c: ApiCourse) {
  const tees = [] as unknown[];
  const groups = (c.tees ?? {}) as { male?: ApiTee[]; female?: ApiTee[] };
  for (const [g, G] of [['male', 'M'], ['female', 'F']] as const) {
    const seen = new Set<string>();
    for (const t of groups[g] ?? []) {
      const holes = (t.holes ?? []).map((h, i) => ({ number: i + 1, par: h.par, strokeIndex: h.handicap ?? 0, yards: h.yardage ?? 0 }));
      if (!holes.length) continue;
      let id = slug(t.tee_name || 'tee') + (G === 'F' ? '-women' : '');
      while (seen.has(id)) id += '-2';
      seen.add(id);
      tees.push({ id, name: t.tee_name, gender: G, courseRating: t.course_rating ?? 0, slope: t.slope_rating ?? 113, par: t.par_total ?? holes.reduce((s, h) => s + h.par, 0), holes });
    }
  }
  return { id: appId(c.id), name: title(c), city: c.location?.city, region: c.location?.state, country: country(c.location?.country), tees, source: 'Online course database (GolfCourseAPI)' };
}

async function provider(path: string): Promise<{ ok: true; body: unknown } | { ok: false; status: number }> {
  const key = Deno.env.get('GOLFCOURSEAPI_KEY');
  if (!key) return { ok: false, status: 503 };
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, body: await res.json() };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  // Signed-in app users only (guests included: they have an anonymous session).
  const auth = req.headers.get('Authorization') ?? '';
  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: who } = await user.auth.getUser();
  if (!who?.user) return json({ error: 'Sign in to search online courses.' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let body: { action?: string; q?: string; id?: string };
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }

  if (body.action === 'search') {
    const q = String(body.q ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
    if (q.length < 3) return json({ courses: [] });
    const { data: hit } = await admin.from('catalog_searches').select('results, searched_at').eq('q', q).maybeSingle();
    if (hit && Date.now() - new Date(hit.searched_at).getTime() < SEARCH_TTL_DAYS * 864e5) return json({ courses: hit.results, cached: true });
    const r = await provider(`/search?search_query=${encodeURIComponent(q)}`);
    if (!r.ok) return json({ error: r.status === 429 ? 'The online course search is busy. Try again later.' : 'Online course search isn’t available right now.', status: r.status }, 502);
    const list = ((r.body as { courses?: ApiCourse[] }).courses ?? []).slice(0, 25).map((c) => ({
      sourceId: String(c.id), id: appId(c.id), name: title(c), city: c.location?.city ?? null, region: c.location?.state ?? null, country: country(c.location?.country),
    }));
    await admin.from('catalog_searches').upsert({ q, results: list, searched_at: new Date().toISOString() });
    return json({ courses: list });
  }

  if (body.action === 'get') {
    const sourceId = String(body.id ?? '').replace(/^gca-/, '');
    if (!/^[0-9a-z]{1,20}$/i.test(sourceId)) return json({ error: 'Bad course id' }, 400);
    const { data: stored } = await admin.from('catalog_courses').select('data').eq('id', appId(sourceId)).maybeSingle();
    if (stored) return json({ course: stored.data, cached: true });
    const r = await provider(`/courses/${encodeURIComponent(sourceId)}`);
    if (!r.ok) return json({ error: r.status === 429 ? 'The online course search is busy. Try again later.' : 'Couldn’t load that course right now.', status: r.status }, 502);
    const raw = ((r.body as { course?: ApiCourse }).course ?? r.body) as ApiCourse;
    const course = toAppCourse(raw);
    if (!course.tees.length) return json({ error: 'That course has no scorecard online yet. Use Upload New Course to add it.' }, 404);
    await admin.from('catalog_courses').upsert({ id: course.id, source: 'golfcourseapi', source_id: sourceId, name: course.name, city: course.city ?? null, region: course.region ?? null, country: course.country, data: course });
    return json({ course });
  }

  return json({ error: 'Unknown action' }, 400);
});
