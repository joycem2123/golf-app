// Ask friends to update their handicap index: saves a nudge for each (only friends, not too often)
// and sends a push notification to anyone who has turned them on.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const { to } = await req.json();
    if (!Array.isArray(to) || to.length === 0 || to.length > 40) return json({ error: 'Pick who to ask.' }, 400);
    // As the signed-in user, so the database rules decide who can be asked.
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: who } = await asUser.auth.getUser();
    if (!who.user) return json({ error: 'Sign in first.' }, 401);
    const sent: string[] = [];
    const skipped: string[] = [];
    for (const id of to) {
      const { error } = await asUser.from('nudges').insert({ to_user: id, kind: 'handicap' });
      (error ? skipped : sent).push(id);
    }
    if (sent.length) {
      // Push tokens are private, so read them with the server key.
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const [{ data: me }, { data: tokens }] = await Promise.all([
        admin.from('profiles').select('display_name').eq('id', who.user.id).maybeSingle(),
        admin.from('push_tokens').select('user_id, token').in('user_id', sent),
      ]);
      const first = (me?.display_name ?? 'A friend').split(' ')[0];
      const messages = (tokens ?? []).map((t) => ({
        to: t.token,
        title: 'Update your handicap?',
        body: `${first} is setting up a match. Is your handicap index up to date?`,
        data: { kind: 'handicap' },
        sound: 'default',
      }));
      if (messages.length) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(messages),
        }).catch((e) => console.error('push failed', e));
      }
    }
    return json({ sent, skipped });
  } catch (e) {
    console.error(e);
    return json({ error: 'Couldn’t send. Try again.' }, 500);
  }
});
