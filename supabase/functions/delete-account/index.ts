// Permanently delete the signed-in user's account and everything tied to it
// (profile, friends, rounds they started, shared courses, requests). Required by the App Store.
// The user must enter their current password, which is checked here before anything is deleted.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: who } = await asUser.auth.getUser();
    if (!who.user) return json({ error: 'Sign in first.' }, 401);
    // The current password is required, checked here on the server (not just in the app).
    const { password } = await req.json().catch(() => ({ password: '' }));
    if (!who.user.email || typeof password !== 'string' || !password) return json({ error: 'Enter your current password.', code: 'password' }, 400);
    const check = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: wrong } = await check.auth.signInWithPassword({ email: who.user.email, password });
    if (wrong) return json({ error: 'That password isn’t right.', code: 'password' }, 403);
    await check.auth.signOut().catch(() => undefined);
    // Only the account itself can be deleted, so the id comes from the signed-in session.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await admin.auth.admin.deleteUser(who.user.id);
    if (error) throw error;
    return json({ deleted: true });
  } catch (e) {
    console.error(e);
    return json({ error: 'Couldn’t delete your account. Try again, or contact support.' }, 500);
  }
});
