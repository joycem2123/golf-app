/**
 * A Skins round's results: the skins table (who won how many), then the scorecard hole by hole with every skin
 * marked where it was won (gold, with how many it was worth) and the holes that carried over.
 */
import type { SkinsResult } from '@golf/engine';
import { ScrollView, Text, View } from 'react-native';

import { Card, H2 } from '@/components/ui';
import { grossAt, teeFor } from '@/lib/round';
import type { RoundRecord } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';

const CELL = 34;
const ROW = 34;

/** "Jim Wins!" / "Jim & Bob tie" and "4 skins": the line at the top of the results. */
export function skinsHeadline(res: SkinsResult, name: (id: string) => string): { headline: string; sub: string; winners: string[] } {
  const top = Math.max(0, ...Object.values(res.skins));
  if (top === 0) return { headline: 'No skins won', sub: res.unclaimed ? `${res.unclaimed} skin${res.unclaimed === 1 ? '' : 's'} left on the table` : 'Every hole was tied', winners: [] };
  const winners = Object.keys(res.skins).filter((id) => res.skins[id] === top);
  const holesOf = (id: string) => res.holes.filter((h) => h.status === 'won' && h.winnerId === id).length;
  const first = (id: string) => name(id).split(' ')[0];
  const n = `${top} skin${top === 1 ? '' : 's'}`;
  return winners.length === 1
    ? { headline: `${first(winners[0])} Wins!`, sub: `${n} won · ${holesOf(winners[0])} hole${holesOf(winners[0]) === 1 ? '' : 's'}${res.unclaimed ? ` · ${res.unclaimed} carried past the last hole` : ''}`, winners }
    : { headline: `${winners.map(first).join(' & ')} tie`, sub: `${n} each`, winners };
}

export function SkinsCard({ r, res, isMe }: { r: RoundRecord; res: SkinsResult; isMe: (id: string) => boolean }) {
  const c = useColors();
  const ids = Object.keys(res.skins);
  const name = (id: string) => r.players.find((p) => p.id === id)?.name ?? '?';
  const first = (id: string) => name(id).split(' ')[0];
  const order = [...ids].sort((a, b) => res.skins[b] - res.skins[a] || name(a).localeCompare(name(b)));
  const top = Math.max(0, ...Object.values(res.skins));
  // Hole numbers as played (9 holes or a different start are mapped back to the real hole).
  const real = (i: number) => res.holeOrder?.[i] ?? i + 1;
  const tee = teeFor(r, ids[0]);
  const mono = { fontVariant: ['tabular-nums' as const] };
  const holes = res.holes;
  // Holes each player won outright (a carried-over win counts once, but is worth all the skins it carried).
  const holesWon = (id: string) => holes.filter((h) => h.status === 'won' && h.winnerId === id).length;

  const cell = (child: React.ReactNode, bg?: string, key?: string | number) => (
    <View key={key} style={{ width: CELL, height: ROW, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>{child}</View>
  );

  return (
    <Card style={{ gap: space.sm }}>
      <H2>Skins</H2>
      {/* Who won how many: skins, and holes won. */}
      <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', paddingHorizontal: space.md, paddingVertical: 6, backgroundColor: c.chip }}>
          <Text style={{ flex: 1, color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>PLAYER</Text>
          <Text style={{ width: 64, textAlign: 'center', color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>SKINS</Text>
          <Text style={{ width: 64, textAlign: 'center', color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>HOLES</Text>
        </View>
        {order.map((id, i) => {
          const lead = top > 0 && res.skins[id] === top;
          return (
            <View key={id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: c.border, backgroundColor: lead ? '#F6EFD9' : c.card }}>
              <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontWeight: isMe(id) || lead ? '800' : '600', fontSize: 15 }}>{lead ? '🏆 ' : ''}{name(id)}{isMe(id) ? ' (you)' : ''}</Text>
              <Text style={{ width: 64, textAlign: 'center', color: lead ? c.brandGold : c.primary, fontFamily: fonts.serif, fontWeight: '700', fontSize: 20 }}>{res.skins[id]}</Text>
              <Text style={{ width: 64, textAlign: 'center', color: c.text, fontSize: 15, ...mono }}>{holesWon(id)}</Text>
            </View>
          );
        })}
      </View>

      {/* The card: names fixed on the left, holes scroll sideways. */}
      <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: c.border, borderRadius: radius.md, overflow: 'hidden' }}>
        <View style={{ width: 78, borderRightWidth: 1, borderRightColor: c.border, backgroundColor: c.card }}>
          {['HOLE', 'PAR'].map((t) => (
            <View key={t} style={{ height: ROW, justifyContent: 'center', paddingHorizontal: 8, backgroundColor: t === 'HOLE' ? c.brand : c.chip }}>
              <Text style={{ color: t === 'HOLE' ? '#fff' : c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>{t}</Text>
            </View>
          ))}
          {order.map((id) => (
            <View key={id} style={{ height: ROW, justifyContent: 'center', paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text numberOfLines={1} style={{ color: c.text, fontWeight: isMe(id) ? '800' : '600', fontSize: 13 }}>{first(id)}</Text>
            </View>
          ))}
          <View style={{ height: ROW, justifyContent: 'center', paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.primarySoft }}>
            <Text style={{ color: c.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>SKIN</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={{ flexDirection: 'row', backgroundColor: c.brand }}>
              {holes.map((h, i) => cell(<Text style={{ color: '#fff', fontWeight: '800', fontSize: 13, ...mono }}>{real(i)}</Text>, undefined, i))}
              {cell(<Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>TOT</Text>, undefined, 'tot')}
            </View>
            <View style={{ flexDirection: 'row', backgroundColor: c.chip }}>
              {holes.map((h, i) => cell(<Text style={{ color: c.muted, fontSize: 12, ...mono }}>{tee.holes[real(i) - 1]?.par ?? ''}</Text>, undefined, i))}
              {cell(null, undefined, 'tot')}
            </View>
            {order.map((id) => (
              <View key={id} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.border }}>
                {holes.map((h, i) => {
                  const g = grossAt(r, id, real(i));
                  const won = h.status === 'won' && h.winnerId === id;
                  const strokes = res.strokes[id]?.[i] ?? 0;
                  return cell(
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: won ? '#fff' : c.text, fontWeight: won ? '800' : '500', fontSize: 14, ...mono }}>{g ?? '–'}</Text>
                      {strokes > 0 ? <Text style={{ position: 'absolute', top: -4, right: -7, color: won ? '#fff' : c.accent, fontSize: 9 }}>{'•'.repeat(Math.min(strokes, 2))}</Text> : null}
                    </View>,
                    won ? c.brandGold : undefined,
                    i,
                  );
                })}
                {cell(<Text style={{ color: res.skins[id] ? c.primary : c.muted, fontFamily: fonts.serif, fontWeight: '700', fontSize: 16 }}>{res.skins[id]}</Text>, c.primarySoft, 'tot')}
              </View>
            ))}
            {/* What happened on each hole: won (by whom, worth how many), carried, or nobody. */}
            <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.primarySoft }}>
              {holes.map((h, i) =>
                cell(
                  h.status === 'won' && h.winnerId ? (
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: c.primary, fontWeight: '800', fontSize: 11 }}>{first(h.winnerId).slice(0, 4)}</Text>
                      {h.value > 1 ? <Text style={{ color: c.brandGold, fontWeight: '800', fontSize: 10 }}>×{h.value}</Text> : null}
                    </View>
                  ) : h.status === 'carried' || h.status === 'notValidated' ? (
                    <Text style={{ color: c.muted, fontSize: 14 }}>→</Text>
                  ) : h.status === 'pending' ? (
                    <Text style={{ color: c.muted, fontSize: 11 }}>?</Text>
                  ) : (
                    <Text style={{ color: c.muted, fontSize: 12 }}>–</Text>
                  ),
                  undefined,
                  i,
                ),
              )}
              {cell(null, undefined, 'tot')}
            </View>
          </View>
        </ScrollView>
      </View>
      <Text style={{ color: c.muted, fontSize: 12, lineHeight: 17 }}>
        Gold = skin won (×2, ×3 when skins carried over). → = tied, carried to the next hole.{Object.values(res.strokes).some((s) => s.some((x) => x > 0)) ? ' • = handicap stroke.' : ''}{res.unclaimed ? ` ${res.unclaimed} skin${res.unclaimed === 1 ? ' was' : 's were'} never won.` : ''}
      </Text>
    </Card>
  );
}
