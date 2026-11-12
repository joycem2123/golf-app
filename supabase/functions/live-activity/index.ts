// Updates the live score cards (iOS Live Activities) on other players' phones when a score is entered.
//
// The phone that entered the score sends the match's new card content; this checks the caller may score
// that round, then sends it through Apple's push service to every other phone showing that match.
// Each phone's own side ("mine") is filled in from what it registered.
//
// Needs the Apple push key as Edge Function secrets: APNS_KEY_P8 (the .p8 file's contents), and
// optionally APNS_KEY_ID / APPLE_TEAM_ID (defaults below).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const BUNDLE_ID = 'com.clutchupgolf.app';
const KEY_ID = Deno.env.get('APNS_KEY_ID') ?? '23749BZUS9';
const TEAM_ID = Deno.env.get('APPLE_TEAM_ID') ?? 'NVKSSW8ZV6';

// Only these fields go on a card, as short strings (and `done`).
const FIELDS = ['title', 'aName', 'bName', 'aColor', 'bColor', 'aStatus', 'bStatus', 'lead', 'big', 'thru'] as const;
function cleanProps(p: Record<string, unknown>) {
  const out: Record<string, string | boolean> = {};
  for (const k of FIELDS) out[k] = typeof p?.[k] === 'string' ? (p[k] as string).slice(0, 60) : '';
  out.done = p?.done === true;
  return out;
}

const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b);
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

let jwt: { token: string; at: number } | null = null;
/** Apple's push service takes a short signed token (good for up to an hour); reuse it for 45 minutes. */
async function apnsToken(): Promise<string> {
  if (jwt && Date.now() - jwt.at < 45 * 60_000) return jwt.token;
  const pem = Deno.env.get('APNS_KEY_P8');
  if (!pem) throw new Error('APNS_KEY_P8 is not set');
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (ch) => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID }));
  const body = b64url(JSON.stringify({ iss: TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${body}`));
  jwt = { token: `${head}.${body}.${b64url(sig)}`, at: Date.now() };
  return jwt.token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const { roundId, gi, props, end } = await req.json();
    if (typeof roundId !== 'string' || typeof gi !== 'number' || typeof props !== 'object') return json({ error: 'Bad request' }, 400);

    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: who } = await asUser.auth.getUser();
    const me = who.user?.id;
    if (!me) return json({ error: 'Sign in first.' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Only someone who can score this round may update its cards.
    const [{ data: round }, { data: mem }, { data: claim }] = await Promise.all([
      admin.from('rounds').select('owner').eq('id', roundId).maybeSingle(),
      admin.from('round_members').select('role').eq('round_id', roundId).eq('user_id', me).maybeSingle(),
      admin.from('round_identities').select('player_id').eq('round_id', roundId).eq('user_id', me).limit(1),
    ]);
    if (!round) return json({ sent: 0 });
    const canScore = round.owner === me || mem?.role === 'owner' || mem?.role === 'scorer' || (claim ?? []).length > 0;
    if (!canScore) return json({ error: 'Not allowed.' }, 403);

    const { data: rows } = await admin.from('live_activity_tokens').select('activity_id, token, side, user_id')
      .eq('round_id', roundId).eq('game_index', gi).neq('user_id', me);
    if (!rows?.length) return json({ sent: 0 });

    const auth = await apnsToken();
    const card = cleanProps(props as Record<string, unknown>);
    const now = Math.floor(Date.now() / 1000);
    let sent = 0;
    const gone: string[] = [];
    await Promise.all(rows.map(async (row) => {
      const aps: Record<string, unknown> = {
        timestamp: now,
        event: end ? 'end' : 'update',
        'content-state': { name: 'RoundActivity', props: JSON.stringify({ ...card, mine: row.side ?? '' }) },
        'stale-date': now + 2 * 3600,
      };
      if (end) aps['dismissal-date'] = now + 30 * 60;
      const res = await fetch(`https://api.push.apple.com/3/device/${row.token}`, {
        method: 'POST',
        headers: {
          authorization: `bearer ${auth}`,
          'apns-topic': `${BUNDLE_ID}.push-type.liveactivity`,
          'apns-push-type': 'liveactivity',
          'apns-priority': '10',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ aps }),
      }).catch((e) => { console.error('apns', e); return null; });
      if (res?.ok) sent++;
      else if (res && (res.status === 410 || res.status === 400)) {
        const why = await res.text().catch(() => '');
        console.error('apns rejected', res.status, why);
        if (res.status === 410 || /BadDeviceToken|Unregistered/.test(why)) gone.push(row.activity_id);
      }
    }));
    // Cards that no longer exist (ended or dismissed): forget them.
    if (gone.length || end) {
      await admin.from('live_activity_tokens').delete().in('activity_id', end ? rows.map((r) => r.activity_id) : gone);
    }
    return json({ sent });
  } catch (e) {
    console.error(e);
    return json({ error: 'Couldn’t update.' }, 500);
  }
});
