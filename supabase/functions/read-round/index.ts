import { createClient } from 'npm:@supabase/supabase-js@2';
// Reads a photo of a filled-in golf scorecard and returns each player's (or team's) score on every hole.
// Needs the ANTHROPIC_API_KEY secret. Only signed-in users (guests included) can call it.
import Anthropic from 'npm:@anthropic-ai/sdk';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SCORES = {
  type: 'array',
  description: 'Exactly 18 entries: index 0 = hole 1 ... index 17 = hole 18. Gross strokes as written; null if blank, crossed out without a replacement, or unreadable.',
  items: { type: ['integer', 'null'] },
};
const SCHEMA = {
  type: 'object',
  properties: {
    courseName: { type: ['string', 'null'], description: 'Golf course name printed on the card' },
    date: { type: ['string', 'null'], description: 'Date written on the card as YYYY-MM-DD, or null' },
    rows: {
      type: 'array',
      description: 'One entry per player (or team) row that has handwritten scores, top to bottom',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name or initials as written; "Player 1" etc. if none' },
          scores: SCORES,
          unsure: {
            type: 'array',
            description: 'Hole numbers (1-18) whose score was hard to read',
            items: { type: 'integer' },
          },
        },
        required: ['name', 'scores', 'unsure'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string', description: 'Anything unclear, in one or two short sentences; empty if all clear' },
  },
  required: ['courseName', 'date', 'rows', 'notes'],
  additionalProperties: false,
};

const SYSTEM = `You read photos of filled-in golf scorecards and transcribe the handwritten scores exactly.
Return one row for each player or team with handwritten scores. Ignore printed rows (yardages, par, handicap) and
rows used for match status (+/-, "up", dots or lines), putts or other tallies, and the OUT / IN / TOTAL columns.
Map every score to its hole number using the printed hole numbers on the card, so a back-nine-only card fills
holes 10-18 and leaves holes 1-9 null. Where a score is circled, squared or has a dot, return just the number.
If a number is overwritten, use the final number. Never guess a blank hole; use null. List any score you are not
sure about in "unsure".`;


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
    const { image, mediaType, roundId, eventId } = await req.json();
    if (!(await proAllowed(req, { roundId, eventId }))) return json(NEEDS_PRO, 402);
    if (typeof image !== 'string' || image.length > 8_000_000) return json({ error: 'Send one photo under 6 MB.' }, 400);
    const media = ['image/jpeg', 'image/png', 'image/webp'].includes(mediaType) ? mediaType : 'image/jpeg';
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'Scorecard reading isn’t set up yet.' }, 503);
    const client = new Anthropic({ apiKey: key });
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media, data: image } },
            { type: 'text', text: 'Transcribe the players’ scores on this scorecard.' },
          ],
        },
      ],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    if (msg.stop_reason === 'refusal') return json({ error: 'Couldn’t read this photo.' }, 422);
    if (msg.stop_reason === 'max_tokens') return json({ error: 'The scorecard was too long to read in one go.' }, 422);
    const text = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
    const card = JSON.parse(text);
    // Always 18 slots per row, whole numbers 1-20 only.
    card.rows = (card.rows ?? []).slice(0, 12).map((r: { name: string; scores: unknown[]; unsure: number[] }) => ({
      name: String(r.name ?? '').slice(0, 40),
      scores: Array.from({ length: 18 }, (_, i) => {
        const v = r.scores?.[i];
        return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 20 ? v : null;
      }),
      unsure: (r.unsure ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= 18),
    }));
    return json({ card });
  } catch (e) {
    console.error(e);
    return json({ error: 'Couldn’t read the scorecard. Try a clearer, straight-on photo.' }, 500);
  }
});
