// Clutch Up Pro purchases, from RevenueCat (which handles the App Store).
//
// 1. RevenueCat calls this (its "webhook") whenever a subscription starts, renews, is cancelled or
//    expires. It must send the Authorization header set in RevenueCat, which must match the
//    REVENUECAT_WEBHOOK_AUTH secret here.
// 2. The app calls this right after a purchase or restore ({ sync: true }, signed in), so Pro takes effect
//    straight away; it asks RevenueCat for the signed-in user's subscription using REVENUECAT_SECRET_KEY.
//
// The app identifies users to RevenueCat by their Clutch Up account id, so app_user_id is that id.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ENTITLEMENT = 'pro';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// deno-lint-ignore no-explicit-any
type Admin = any;

async function save(admin: Admin, userId: string, until: string | null, willRenew: boolean | null, product: string | null) {
  if (!UUID.test(userId)) return;
  await admin.from('subscriptions').upsert(
    { user_id: userId, pro_until: until, will_renew: willRenew, product, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
}

/** Ask RevenueCat for this user's Pro entitlement and record it. */
async function syncFromRevenueCat(admin: Admin, userId: string) {
  const key = Deno.env.get('REVENUECAT_SECRET_KEY');
  if (!key) return { synced: false, reason: 'not set up' };
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) return { synced: false, reason: `RevenueCat ${res.status}` };
  const body = await res.json();
  const ent = body?.subscriber?.entitlements?.[ENTITLEMENT];
  const sub = ent?.product_identifier ? body?.subscriber?.subscriptions?.[ent.product_identifier] : null;
  await save(admin, userId, ent?.expires_date ?? null, sub ? !sub.unsubscribe_detected_at : null, ent?.product_identifier ?? null);
  return { synced: true, until: ent?.expires_date ?? null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const body = await req.json();

    // From the app, after buying or restoring.
    if (body?.sync === true) {
      const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      });
      const { data: who } = await asUser.auth.getUser();
      if (!who?.user) return json({ error: 'Sign in first.' }, 401);
      return json(await syncFromRevenueCat(admin, who.user.id));
    }

    // From RevenueCat.
    const auth = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
    if (!auth || req.headers.get('Authorization') !== auth) return json({ error: 'Not allowed' }, 401);
    const ev = body?.event;
    if (!ev?.app_user_id) return json({ ok: true });
    // Whatever happened (purchase, renewal, cancellation, expiry, transfer), RevenueCat's own record is
    // the truth: ask it, so out-of-order or repeated events can't leave the wrong answer.
    const ids = [ev.app_user_id, ...(Array.isArray(ev.aliases) ? ev.aliases : []), ...(Array.isArray(ev.transferred_to) ? ev.transferred_to : [])]
      .filter((x: unknown) => typeof x === 'string' && UUID.test(x as string));
    for (const id of new Set<string>(ids)) {
      const r = await syncFromRevenueCat(admin, id);
      // Without the API key, fall back to the event itself.
      if (!r.synced && ev.expiration_at_ms) {
        await save(admin, id, new Date(ev.expiration_at_ms).toISOString(), ev.type !== 'CANCELLATION' && ev.type !== 'EXPIRATION', ev.product_id ?? null);
      }
    }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: 'Couldn’t process.' }, 500);
  }
});
