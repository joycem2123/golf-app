// Reads a photo of a golf scorecard and returns the course's tees and holes as JSON.
// Needs the ANTHROPIC_API_KEY secret. Only signed-in users (guests included) can call it.
import Anthropic from 'npm:@anthropic-ai/sdk';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HOLE = {
  type: 'object',
  properties: {
    number: { type: 'integer' },
    par: { type: 'integer' },
    strokeIndex: { type: 'integer', description: 'Hole handicap: 1 = hardest' },
    yards: { type: ['integer', 'null'] },
  },
  required: ['number', 'par', 'strokeIndex', 'yards'],
  additionalProperties: false,
};
const TEE = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Tee name or colour, e.g. Blue, White, Red' },
    gender: { type: 'string', enum: ['M', 'F'] },
    courseRating: { type: ['number', 'null'] },
    slope: { type: ['integer', 'null'] },
    holes: { type: 'array', items: HOLE },
  },
  required: ['name', 'gender', 'courseRating', 'slope', 'holes'],
  additionalProperties: false,
};
const SCHEMA = {
  type: 'object',
  properties: {
    courseName: { type: ['string', 'null'] },
    city: { type: ['string', 'null'] },
    region: { type: ['string', 'null'], description: 'Province or state abbreviation' },
    tees: { type: 'array', items: TEE },
    notes: { type: 'string', description: 'Anything unclear or unreadable, in one or two short sentences; empty if all clear' },
  },
  required: ['courseName', 'city', 'region', 'tees', 'notes'],
  additionalProperties: false,
};

const SYSTEM = `You read photos of golf scorecards and transcribe them exactly.
Return one tee per row of yardages on the card. Use the men's par and handicap rows for men's tees and the
ladies' (women's) par and handicap rows for ladies' tees. If a tee has ratings for both men and women, return it
twice: once with gender M and once with gender F. Hole handicaps (stroke index) must use each number 1-18 once for
an 18-hole card. Copy course rating and slope exactly as printed (often written like 70.6/130); use null when a
value isn't on the card, never guess. Only include holes printed on the card (9 or 18).`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const { image, mediaType, hint } = await req.json();
    if (typeof image !== 'string' || image.length > 8_000_000) return json({ error: 'Send one photo under 6 MB.' }, 400);
    const media = ['image/jpeg', 'image/png', 'image/webp'].includes(mediaType) ? mediaType : 'image/jpeg';
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'Scorecard scanning isn’t set up yet.' }, 503);
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
            { type: 'text', text: `Transcribe this scorecard.${hint?.name ? ` The course is probably ${hint.name}${hint.city ? `, ${hint.city}` : ''}.` : ''}` },
          ],
        },
      ],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    if (msg.stop_reason === 'refusal') return json({ error: 'Couldn’t read this photo.' }, 422);
    if (msg.stop_reason === 'max_tokens') return json({ error: 'The scorecard was too long to read in one go.' }, 422);
    const text = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
    return json({ card: JSON.parse(text) });
  } catch (e) {
    console.error(e);
    return json({ error: 'Couldn’t read the scorecard. Try a clearer, straight-on photo.' }, 500);
  }
});
