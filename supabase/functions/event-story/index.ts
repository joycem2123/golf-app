// Writes a short overview of a whole golf event (trip, Ryder Cup or season) from its completed matches.
// Called by the app for signed-in players (guests included); needs the ANTHROPIC_API_KEY secret.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM = `You write the overview of a friendly golf event (a trip, a Ryder Cup style team event, or a season)
for its results page. Use only the facts you are given: never invent shots, scores, weather, venues or quotes.
Write one paragraph of 3 to 6 sentences, past tense, in the voice of a warm, witty golf commentator.
Cover the overall picture: where the team score or standings stand (or who won, if it is finished), the key
rounds or swings, standout players and their records, and any memorable results such as big wins or comebacks.
If the event is still going, end with what is at stake next. Name players by first name. Plain text only:
no headings, lists, emoji or markdown.`;


// ---- Clutch Up Pro: the caller's Pro, or the organiser's (the round's or event's owner), covers it.
// (While the paywall is off, everyone has it.)
async function proAllowed(req: Request, ids: { roundId?: unknown; eventId?: unknown }): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: who } = await asUser.auth.getUser();
  const owners = new Set<string>([who?.user?.id ?? '00000000-0000-0000-0000-000000000000']);
  if (typeof ids.roundId === 'string') {
    // Only rounds I can see (read as me).
    const { data: r } = await asUser.from('rounds').select('owner, event_id').eq('id', ids.roundId).maybeSingle();
    if (r?.owner) owners.add(r.owner);
    if (r?.event_id) {
      const { data: e } = await admin.from('events').select('owner').eq('id', r.event_id).maybeSingle();
      if (e?.owner) owners.add(e.owner);
    }
  }
  if (typeof ids.eventId === 'string') {
    const { data: e } = await asUser.from('events').select('owner').eq('id', ids.eventId).maybeSingle();
    if (e?.owner) owners.add(e.owner);
  }
  for (const uid of owners) {
    const { data } = await admin.rpc('has_pro_for', { uid });
    if (data === true) return true;
  }
  return false;
}
const NEEDS_PRO = { error: 'This is a Clutch Up Pro feature.', needsPro: true };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const { facts, eventId } = await req.json();
    if (!(await proAllowed(req, { eventId }))) return json(NEEDS_PRO, 402);
    if (typeof facts !== 'object' || !facts || JSON.stringify(facts).length > 40000) return json({ error: 'Bad request' }, 400);

    // Signed-in users only (guests have an anonymous sign-in).
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: who } = await supa.auth.getUser();
    if (!who?.user) return json({ error: 'Sign in first' }, 401);

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'AI summaries are not set up yet' }, 503);
    const client = new Anthropic({ apiKey: key });
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 3000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: `Here is the event:\n${JSON.stringify(facts, null, 1)}` }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    if (msg.stop_reason === 'refusal') return json({ error: 'No story this time' }, 422);
    const story = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('').trim();
    return json({ story });
  } catch (e) {
    console.error(e);
    return json({ error: 'Could not write the story' }, 500);
  }
});
