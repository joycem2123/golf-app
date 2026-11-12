// Writes a short, lively story of a golf match from its hole-by-hole results.
// Called by the app for players in the round; needs the ANTHROPIC_API_KEY secret.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM = `You write the story of a friendly golf match for the players' results page.
Use only the facts you are given: never invent shots, clubs, distances, weather or quotes.
Write 2 to 4 sentences, past tense, in the voice of a warm, witty golf commentator.
Name players by the first names given. Mention the turning point (a comeback, a run of holes won,
a big birdie, a lead that slipped) and how and where the match ended. Plain text only, no headings,
no lists, no emoji.`;


// ---- Clutch Up Pro: generating stories and reading scorecards need the caller's own Pro, in events too.
// (Friends brought into a host's event can play and see everything, but not use these.) While the
// paywall is off, everyone has it.
async function proAllowed(req: Request, _ids?: { roundId?: unknown; eventId?: unknown }): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: who } = await asUser.auth.getUser();
  const { data } = await admin.rpc('has_pro_for', { uid: who?.user?.id ?? '00000000-0000-0000-0000-000000000000' });
  return data === true;
}
const NEEDS_PRO = { error: 'This is a Clutch Up Pro feature.', needsPro: true };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const { roundId, facts } = await req.json();
    if (!(await proAllowed(req, { roundId }))) return json(NEEDS_PRO, 402);
    if (typeof roundId !== 'string' || typeof facts !== 'object' || JSON.stringify(facts).length > 20000) return json({ error: 'Bad request' }, 400);

    // Only people in the round can ask for its story.
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: round } = await supa.from('rounds').select('id').eq('id', roundId).maybeSingle();
    if (!round) return json({ error: 'Not in this round' }, 403);

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'AI summaries are not set up yet' }, 503);
    const client = new Anthropic({ apiKey: key });
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: `Here is the match:\n${JSON.stringify(facts, null, 1)}` }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    if (msg.stop_reason === 'refusal') return json({ error: 'No story this time' }, 422);
    const story = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('').trim();
    return json({ story });
  } catch (e) {
    console.error(e);
    return json({ error: 'Could not write the story' }, 500);
  }
});
