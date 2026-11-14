// Push notifications the app asks for after something happens. Each is checked against the database
// (it must be real and started by the caller) and sent only once:
//   edit   - someone asked to enter scores in your match
//   friend - someone sent you a friend request
//   round  - someone added you to a round that has started
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first = (n: string | null | undefined, fallback: string) => (n ?? '').trim().split(' ')[0] || fallback;

// deno-lint-ignore no-explicit-any
type Admin = any;

async function tellEventFollowers(admin: Admin, me: string, roundId: string, eventId: string, starter?: string | null) {
  // Once per round, however many times this is asked.
  const { data: fresh } = await admin.from('match_status').upsert({ round_id: roundId, game_index: -2, state: 'started' }, { onConflict: 'round_id,game_index', ignoreDuplicates: true }).select('round_id');
  if (!fresh?.length) return;
  const { data: ev } = await admin.from('events').select('data').eq('id', eventId).maybeSingle();
  const plan = (ev?.data?.rounds ?? []).find((x: { roundId?: string }) => x.roundId === roundId) as { id?: string; number?: number } | undefined;
  const { data: fans } = await admin.from('match_follows').select('user_id, plan_id').eq('event_id', eventId).eq('notify', true).neq('user_id', me);
  const users = [...new Set((fans ?? []).filter((f: { user_id: string; plan_id: string }) => !f.plan_id || f.plan_id === plan?.id).map((f: { user_id: string }) => f.user_id as string))];
  if (!users.length) return;
  const { data: tokens } = await admin.from('push_tokens').select('token').in('user_id', users);
  const name = String(ev?.data?.name ?? 'An event');
  const messages = (tokens ?? []).map((t: { token: string }) => ({
    to: t.token,
    title: `${name}${plan?.number ? ` · Round ${plan.number}` : ''} has started`,
    body: `${first(starter, 'Your friends')} and the group are on the course. Tap to follow live.`,
    data: { kind: 'round_started', roundId },
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const { kind, id, to } = await req.json();
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: who } = await asUser.auth.getUser();
    const me = who.user?.id;
    if (!me) return json({ error: 'Sign in first.' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: prof } = await admin.from('profiles').select('display_name').eq('id', me).maybeSingle();

    let users: string[] = [];
    let title = '';
    let body = '';
    let data: Record<string, string> = {};

    if (kind === 'edit' && typeof id === 'string') {
      // Mark it first, so it can only ever go out once.
      const { data: q } = await admin.from('edit_requests').update({ notified_at: new Date().toISOString() })
        .eq('id', id).eq('requester', me).eq('status', 'pending').is('notified_at', null).select('round_id, game_id, requester_name').maybeSingle();
      if (!q) return json({ sent: 0 });
      const { data: round } = await admin.from('rounds').select('data').eq('id', q.round_id).maybeSingle();
      const { data: people } = await admin.rpc('game_people', { data: round?.data ?? {}, gid: q.game_id });
      const members: string[] = (Array.isArray(people) ? people[0]?.members : people?.members) ?? [];
      const { data: claims } = await admin.from('round_identities').select('player_id, user_id').eq('round_id', q.round_id).in('player_id', members.length ? members : ['-']);
      users = [...members.filter((m) => UUID.test(m)), ...(claims ?? []).map((c) => c.user_id as string)];
      const m = /^match-(\d+)$/.exec(q.game_id);
      title = 'Request to enter scores';
      body = `${first(q.requester_name ?? prof?.display_name, 'Someone')} wants to enter scores in ${m ? `Match ${m[1]}` : 'your match'}. Tap to allow or decline.`;
      data = { kind: 'edit_request', roundId: q.round_id };
    } else if (kind === 'friend' && typeof to === 'string') {
      const { data: q } = await admin.from('friend_requests').update({ notified_at: new Date().toISOString() })
        .eq('from_user', me).eq('to_user', to).eq('status', 'pending').is('notified_at', null).select('to_user').maybeSingle();
      if (!q) return json({ sent: 0 });
      users = [q.to_user];
      title = 'New friend request';
      body = `${prof?.display_name ?? 'Someone'} wants to be friends on Clutch Up.`;
      data = { kind: 'friend_request' };
    } else if (kind === 'round' && typeof id === 'string') {
      const { data: round } = await admin.from('rounds').select('owner, status, data, event_id').eq('id', id).maybeSingle();
      if (!round || round.status !== 'active') return json({ sent: 0 });
      const { data: mem } = await admin.from('round_members').select('role').eq('round_id', id).eq('user_id', me).maybeSingle();
      if (round.owner !== me && mem?.role !== 'owner' && mem?.role !== 'scorer') return json({ sent: 0 });
      // People following this event's upcoming round (notifications on) hear that it's started, once.
      if (round.event_id) await tellEventFollowers(admin, me, id, round.event_id, prof?.display_name);
      // Only people who are players in the round (not those who joined by code to follow along).
      const playerIds: string[] = (round.data?.players ?? []).map((p: { id: string }) => p.id).filter((x: string) => UUID.test(x) && x !== me);
      if (!playerIds.length) return json({ sent: 0 });
      const { data: added } = await admin.from('round_members').update({ notified_at: new Date().toISOString() })
        .eq('round_id', id).is('notified_at', null).in('user_id', playerIds).select('user_id');
      users = (added ?? []).map((a) => a.user_id as string);
      let course = '';
      try { course = round.data?.course?.name ? ` at ${String(round.data.course.name)}` : ''; } catch { /* no course */ }
      title = 'You’re in a round';
      body = `${first(prof?.display_name, 'A friend')} added you to a round${course}. Tap to keep score live.`;
      data = { kind: 'round_added', roundId: id };
    } else if (kind === 'deleted' && typeof id === 'string' && (to === 'round' || to === 'event')) {
      // The organiser is about to delete a round or event: tell everyone else in it (sent just before deleting).
      if (to === 'event') {
        const { data: ev } = await admin.from('events').select('owner, data').eq('id', id).maybeSingle();
        if (!ev || ev.owner !== me) return json({ sent: 0 });
        const { data: mem } = await admin.from('event_members').select('user_id').eq('event_id', id);
        users = (mem ?? []).map((m) => m.user_id as string);
        title = 'Event deleted';
        body = `${first(prof?.display_name, 'The organiser')} deleted ${String(ev.data?.name ?? 'an event')}.`;
      } else {
        const { data: org } = await admin.rpc('round_organizer', { rid: id });
        if (org !== me) return json({ sent: 0 });
        const { data: round } = await admin.from('rounds').select('data, event_id').eq('id', id).maybeSingle();
        if (!round) return json({ sent: 0 });
        const { data: mem } = await admin.from('round_members').select('user_id').eq('round_id', id);
        users = (mem ?? []).map((m) => m.user_id as string);
        let what = String(round.data?.label ?? 'a round');
        if (round.event_id) {
          const { data: ev } = await admin.from('events').select('data').eq('id', round.event_id).maybeSingle();
          if (ev?.data?.name) what = `${what} of ${String(ev.data.name)}`;
        }
        title = 'Round deleted';
        body = `${first(prof?.display_name, 'The organiser')} deleted ${what}.`;
      }
      data = { kind: 'deleted' };
    } else {
      return json({ error: 'Bad request' }, 400);
    }

    users = [...new Set(users)].filter((u) => u !== me);
    if (!users.length) return json({ sent: 0 });
    const { data: tokens } = await admin.from('push_tokens').select('token').in('user_id', users);
    const messages = (tokens ?? []).map((t: { token: string }) => ({ to: t.token, title, body, data, sound: 'default' }));
    if (messages.length) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      }).catch((e) => console.error('push failed', e));
    }
    return json({ sent: messages.length });
  } catch (e) {
    console.error(e);
    return json({ error: 'Couldn’t send.' }, 500);
  }
});
