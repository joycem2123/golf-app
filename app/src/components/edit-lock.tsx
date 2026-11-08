import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { gameId, playsIn, type EditRequest, type Rights } from '@/lib/edit-rights';
import { matchLabel, gameName } from '@/lib/games';
import { useStore, type RoundRecord } from '@/store/store';
import { supabase } from '@/sync/supabase';
import { shareRound } from '@/sync/sync';
import { radius, space, useColors } from '@/theme';

/** Shown on a match you're not playing in: view only, unless a player in it says yes. */
export function LockedMatch({ r, gi, uid, requests, reload }: { r: RoundRecord; gi: number; uid: string; requests: EditRequest[]; reload: () => void }) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mine = requests.find((q) => q.game_id === gameId(r, gi) && q.requester === uid);
  const myName = useStore((s) => s.players.find((p) => p.id === s.myPlayerId)?.name ?? s.myUsername ?? null);

  const ask = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (!r.remote) await shareRound(r.id);
      const row = { round_id: r.id, game_id: gameId(r, gi), requester_name: myName };
      const { error } = mine
        ? await supabase.from('edit_requests').delete().eq('id', mine.id).then(() => supabase.from('edit_requests').insert(row))
        : await supabase.from('edit_requests').insert(row);
      if (error) throw new Error(error.message);
      reload();
    } catch {
      setErr('Couldn’t send the request. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const pending = mine?.status === 'pending';
  const declined = mine?.status === 'declined';
  return (
    <View style={{ backgroundColor: c.chip, borderRadius: radius.md, padding: space.md, gap: space.sm, borderWidth: 1, borderColor: c.border }}>
      <Text style={{ color: c.text, fontSize: 14 }}>
        <Text style={{ fontWeight: '800' }}>🔒 View only. </Text>
        {pending
          ? 'Request sent. You can enter scores once a player in this match says yes.'
          : declined
            ? 'A player in this match said no to your request.'
            : 'You’re not playing in this match, so only its players can enter scores. Ask one of them to let you.'}
      </Text>
      {!pending && <Button small kind="secondary" title={busy ? 'Sending…' : declined ? 'Ask again' : 'Request to edit'} disabled={busy} onPress={ask} />}
      {err ? <Text style={{ color: c.danger, fontSize: 13 }}>{err}</Text> : null}
    </View>
  );
}

/** For players: requests from others to enter scores in your match. */
export function EditRequestsCard({ r, rights, reload }: { r: RoundRecord; rights: Rights; reload: () => void }) {
  const { uid, requests } = rights;
  const c = useColors();
  const [busy, setBusy] = useState<string | null>(null);
  const waiting = requests.filter((q) => q.status === 'pending' && q.requester !== uid && r.games.some((g, i) => gameId(r, i) === q.game_id && playsIn(r, i, rights)));
  if (waiting.length === 0) return null;
  const answer = async (id: string, approve: boolean) => {
    setBusy(id);
    await supabase.rpc('answer_edit_request', { req: id, approve });
    setBusy(null);
    reload();
  };
  return (
    <View style={{ gap: space.sm }}>
      {waiting.map((q) => {
        const gi = r.games.findIndex((_, i) => gameId(r, i) === q.game_id);
        const g = r.games[gi];
        const which = g ? (matchLabel(g) ? `${matchLabel(g)}` : gameName(g)) : 'your match';
        return (
          <View key={q.id} accessibilityRole="alert" style={{ backgroundColor: c.card, borderRadius: radius.md, padding: space.md, gap: space.sm, borderWidth: 2, borderColor: c.accent }}>
            <Text style={{ color: c.text, fontSize: 14 }}>
              <Text style={{ fontWeight: '800' }}>{q.requester_name || 'Someone'}</Text> wants to enter scores in {which}.
            </Text>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}><Button small title="Allow" disabled={busy === q.id} onPress={() => answer(q.id, true)} /></View>
              <View style={{ flex: 1 }}><Button small kind="secondary" title="Decline" disabled={busy === q.id} onPress={() => answer(q.id, false)} /></View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
