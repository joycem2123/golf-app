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
import { fonts, teamColor, useColors } from '@/theme';

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

/**
 * Phone-sized scoreboard row for a match in play. The status block sits in the middle with a slot either side for its
 * arrow, so the colour never runs over a name and the blocks line up row to row. Long names shrink to fit.
 */
export function LiveMatchRow({ r, results, m, leftLetter, picks, onPress, compact }: { r: RoundRecord; results: Results; m: MatchOutcome; leftLetter?: string; picks: Picks; onPress?: () => void; /** One slim line per match (lists of rounds). */ compact?: boolean }) {
  const c = useColors();
  const v = matchView(r, results, m, leftLetter, picks);
  const h = compact ? 40 : 60;
  const slot = Math.round(h * 0.3);
  const player = (id: string) => r.players.find((p) => p.id === id);
  const first = (id: string) => (player(id)?.name ?? '?').split(' ')[0];
  const slim = (ids: string[], align: 'left' | 'right', color: string) => (
    <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', paddingLeft: align === 'left' ? 10 : 4, paddingRight: align === 'right' ? 10 : 4, alignItems: align === 'left' ? 'flex-start' : 'flex-end' }}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color, fontWeight: '700', fontSize: 14, maxWidth: '100%', textAlign: align }}>
        {ids.length > 1 ? ids.map(first).join(' & ') : (player(ids[0])?.name ?? '?')}
      </Text>
    </View>
  );
  const people = (ids: string[], align: 'left' | 'right', color: string) => compact ? slim(ids, align, color) : (
    <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', gap: 1, paddingLeft: align === 'left' ? 12 : 4, paddingRight: align === 'right' ? 12 : 4, alignItems: align === 'left' ? 'flex-start' : 'flex-end' }}>
      {ids.map((id) => {
        const p = player(id);
        return (
          <Text key={id} numberOfLines={ids.length > 1 ? 1 : 2} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color, fontWeight: '700', fontSize: ids.length > 1 ? 14 : 15, lineHeight: ids.length > 1 ? 17 : 18, maxWidth: '100%', textAlign: align }}>{p?.name ?? '?'}</Text>
        );
      })}
      {ids.length === 1 && player(ids[0])?.handicapIndex !== undefined ? <Text style={{ color: c.muted, fontSize: 11 }}>HCP {formatIndex(player(ids[0])!.handicapIndex)}</Text> : null}
    </View>
  );
  const arrowSlot = (side: 'L' | 'R') => (
    <View style={{ width: slot, height: h, alignItems: side === 'L' ? 'flex-end' : 'flex-start' }}>
      {v.ahead === side ? <Arrow dir={side === 'L' ? 'left' : 'right'} color={v.cellColor} h={h} /> : null}
    </View>
  );
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${v.left.members.map((id) => player(id)?.name).join(' and ')} versus ${v.right.members.map((id) => player(id)?.name).join(' and ')}: ${v.big} ${v.small.toLowerCase()}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', height: h, backgroundColor: pressed ? '#F3F6F4' : '#fff', borderRadius: compact ? 8 : 10, borderWidth: 1, borderColor: c.border, overflow: 'hidden' })}>
      {people(v.left.members, 'left', v.lc)}
      {arrowSlot('L')}
      <View style={{ width: compact ? 64 : 76, height: h, backgroundColor: v.cellColor, alignItems: 'center', justifyContent: 'center', borderLeftWidth: v.ahead ? 0 : 1, borderRightWidth: v.ahead ? 0 : 1, borderColor: c.border }}>
        <Text style={{ color: v.cellText, fontFamily: fonts.serif, fontWeight: '700', fontSize: compact ? 15 : 18, lineHeight: compact ? 17 : undefined }}>{v.big}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: v.cellText, opacity: 0.85, fontWeight: '700', fontSize: compact ? 7.5 : 8.5, letterSpacing: 0.2 }}>{v.small}</Text>
      </View>
      {arrowSlot('R')}
      {people(v.right.members, 'right', v.rc)}
    </Pressable>
  );
}
