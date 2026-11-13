/**
 * The scoreboard look for a match (as on the TV board): each side's players either side, and a status block
 * in the leading team's colour, pointing at the leader. Shared by the TV board and the app's event page.
 */
import { Pressable, Text, View } from 'react-native';

import { formatIndex } from '@/lib/format';
import { headline } from '@/lib/headline';
import { matchOutcomes, type MatchOutcome } from '@/lib/results';
import { evaluate, isResult } from '@/lib/round';
import type { EventRecord, RoundRecord } from '@/store/store';
import { teamColor, useColors } from '@/theme';

const INK = '#14261E';
type Picks = EventRecord['teamColors'];
type Results = ReturnType<typeof evaluate>;

/** The round's team matches (not side bets, not same-team games). */
export const boardMatches = (r: RoundRecord, results: Results) =>
  matchOutcomes(r, results).filter((m) => !(r.games[m.gi].id ?? '').startsWith('side-') && m.a.letter !== m.b.letter);

/** One match's facts for a scoreboard row: who's on each side (leftLetter's team on the left), who's ahead, and the status text. */
export function matchView(r: RoundRecord, results: Results, m: MatchOutcome, leftLetter: string | undefined, picks: Picks) {
  const flip = !!leftLetter && m.a.letter !== leftLetter && m.b.letter === leftLetter;
  const left = flip ? m.b : m.a;
  const right = flip ? m.a : m.b;
  const res = results[m.gi];
  const h = res && isResult(res) ? headline(res, r.players) : null;
  const done = !!m.winner;
  const aheadA = m.winner === 'a' || (!m.winner && h?.side === 0);
  const aheadB = m.winner === 'b' || (!m.winner && h?.side === 1);
  const ahead: 'L' | 'R' | null = aheadA ? (flip ? 'R' : 'L') : aheadB ? (flip ? 'L' : 'R') : null;
  const margin = h?.big.match(/(\d+) UP/)?.[1];
  const win = h?.big.match(/Win (.+)$/)?.[1];
  const big = m.winner === 'halved' ? 'AS' : done ? (win ?? 'WON') : margin ? `${margin} UP` : h && h.small !== 'Not started' ? 'AS' : '—';
  const small = done ? 'FINAL' : h && h.small !== 'Not started' ? h.small.toUpperCase() : 'NOT STARTED';
  const lc = teamColor(left.letter, picks).color;
  const rc = teamColor(right.letter, picks).color;
  const cellColor = ahead === 'L' ? lc : ahead === 'R' ? rc : done ? INK : '#fff';
  const cellText = ahead || done ? '#fff' : INK;
  return { flip, left, right, ahead, big, small, lc, rc, cellColor, cellText, done };
}

/** A triangle pointing left or right (the scoreboard's arrows). */
export function Arrow({ dir, color, h, overlay }: { dir: 'left' | 'right'; color: string; h: number; overlay?: boolean }) {
  const w = h * 0.3;
  return (
    <View style={{
      ...(overlay ? { position: 'absolute' as const, top: 0, zIndex: 2, ...(dir === 'left' ? { left: -w } : { right: -w }) } : null),
      width: 0, height: 0, borderTopWidth: h / 2, borderBottomWidth: h / 2, borderTopColor: 'transparent', borderBottomColor: 'transparent',
      ...(dir === 'right' ? { borderLeftWidth: w, borderLeftColor: color } : { borderRightWidth: w, borderRightColor: color }),
    }} />
  );
}

/** Phone-sized scoreboard row for a match in play. */
export function LiveMatchRow({ r, results, m, leftLetter, picks, onPress }: { r: RoundRecord; results: Results; m: MatchOutcome; leftLetter?: string; picks: Picks; onPress?: () => void }) {
  const c = useColors();
  const v = matchView(r, results, m, leftLetter, picks);
  const h = 62;
  const player = (id: string) => r.players.find((p) => p.id === id);
  const people = (ids: string[], align: 'left' | 'right', color: string) => (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 10, alignItems: align === 'left' ? 'flex-start' : 'flex-end' }}>
      {ids.map((id) => {
        const p = player(id);
        return (
          <View key={id} style={{ alignItems: align === 'left' ? 'flex-start' : 'flex-end' }}>
            <Text numberOfLines={1} style={{ color, fontWeight: '800', fontSize: ids.length > 1 ? 13 : 15 }}>{p?.name ?? '?'}</Text>
            {ids.length === 1 && p?.handicapIndex !== undefined ? <Text style={{ color: c.muted, fontSize: 10, fontWeight: '700' }}>HCP {formatIndex(p.handicapIndex)}</Text> : null}
          </View>
        );
      })}
    </View>
  );
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${v.left.members.map((id) => player(id)?.name).join(' and ')} versus ${v.right.members.map((id) => player(id)?.name).join(' and ')}: ${v.big} ${v.small.toLowerCase()}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', height: h, backgroundColor: pressed ? '#F3F6F4' : '#fff', borderRadius: 10, borderWidth: 1, borderColor: c.border, overflow: 'hidden' })}>
      {people(v.left.members, 'left', v.lc)}
      <View style={{ width: 80, height: h, backgroundColor: v.cellColor, alignItems: 'center', justifyContent: 'center', borderLeftWidth: v.ahead ? 0 : 1, borderRightWidth: v.ahead ? 0 : 1, borderColor: c.border , zIndex: 1, overflow: 'visible' }}>
        {v.ahead ? <Arrow overlay dir={v.ahead === 'L' ? 'left' : 'right'} color={v.cellColor} h={h} /> : null}
        <Text style={{ color: v.cellText, fontWeight: '900', fontSize: 18 }}>{v.big}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: v.cellText, opacity: 0.85, fontWeight: '800', fontSize: 8.5, letterSpacing: 0.3 }}>{v.small}</Text>
      </View>
      {people(v.right.members, 'right', v.rc)}
    </Pressable>
  );
}
