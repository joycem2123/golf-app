/**
 * Wolf, hole by hole: who was the wolf, who they picked (a partner, LW = lone wolf, BW = blind wolf), who won the
 * hole, and the points each player made. With a points table on top. Used under the live scorecard and in results.
 */
import type { WolfResult } from '@golf/engine';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { requestGameStory } from '@/lib/ai-story';
import { justPaywalled } from '@/lib/pro';

import { Card, H2 } from '@/components/ui';
import type { RoundRecord } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';

const CELL = 36;
const ROW = 32;

/** "Matt Wins!" and his points, for the top of the results. */
export function wolfHeadline(res: WolfResult, name: (id: string) => string): { headline: string; sub: string; winners: string[] } {
  const ids = Object.keys(res.points);
  const top = Math.max(...ids.map((id) => res.points[id]));
  const winners = ids.filter((id) => res.points[id] === top);
  const first = (id: string) => name(id).split(' ')[0];
  const pts = `${top > 0 ? '+' : ''}${top} point${Math.abs(top) === 1 ? '' : 's'}`;
  const lone = res.holes.filter((h) => h.decision && h.decision.mode !== 'partner' && h.wolfId === winners[0] && h.result === 'wolfSide').length;
  return winners.length === 1
    ? { headline: `${first(winners[0])} Wins!`, sub: `${pts}${lone ? ` · won ${lone} hole${lone === 1 ? '' : 's'} as a lone wolf` : ''}`, winners }
    : { headline: `${winners.map(first).join(' & ')} tie`, sub: `${pts} each`, winners };
}

export function WolfCard({ r, res, isMe, title = 'Wolf', showTable = true }: { r: RoundRecord; res: WolfResult; isMe: (id: string) => boolean; title?: string; showTable?: boolean }) {
  const c = useColors();
  const ids = Object.keys(res.points);
  const name = (id: string) => r.players.find((p) => p.id === id)?.name ?? '?';
  const first = (id: string) => name(id).split(' ')[0];
  const short = (id: string) => first(id).slice(0, 4);
  const order = [...ids].sort((a, b) => res.points[b] - res.points[a] || name(a).localeCompare(name(b)));
  const top = Math.max(...ids.map((id) => res.points[id]));
  const holes = res.holes;
  const mono = { fontVariant: ['tabular-nums' as const] };
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
  const timesWolf = (id: string) => holes.filter((h) => h.wolfId === id && h.decision).length;
  const wolfWins = (id: string) => holes.filter((h) => h.wolfId === id && h.result === 'wolfSide').length;

  const cell = (child: React.ReactNode, key: string | number, bg?: string) => (
    <View key={key} style={{ width: CELL, height: ROW, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>{child}</View>
  );
  const sideLabel = (t: string, bg: string, color: string) => (
    <View style={{ height: ROW, justifyContent: 'center', paddingHorizontal: 8, backgroundColor: bg, borderTopWidth: 1, borderTopColor: c.border }}>
      <Text style={{ color, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>{t}</Text>
    </View>
  );

  return (
    <Card style={{ gap: space.sm }}>
      <H2>🐺 {title}</H2>
      {showTable ? (
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', paddingHorizontal: space.md, paddingVertical: 6, backgroundColor: c.chip }}>
            <Text style={{ flex: 1, color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>PLAYER</Text>
            <Text style={{ width: 62, textAlign: 'center', color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>POINTS</Text>
            <Text style={{ width: 74, textAlign: 'center', color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>AS WOLF</Text>
          </View>
          {order.map((id, i) => {
            const lead = res.points[id] === top && holes.some((h) => h.result);
            return (
              <View key={id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: c.border, backgroundColor: lead ? '#F6EFD9' : c.card }}>
                <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontWeight: isMe(id) || lead ? '800' : '600', fontSize: 15 }}>{lead ? '🏆 ' : ''}{name(id)}{isMe(id) ? ' (you)' : ''}</Text>
                <Text style={{ width: 62, textAlign: 'center', color: res.points[id] < 0 ? c.under : lead ? c.brandGold : c.primary, fontFamily: fonts.serif, fontWeight: '700', fontSize: 20 }}>{signed(res.points[id])}</Text>
                <Text style={{ width: 74, textAlign: 'center', color: c.muted, fontSize: 13, ...mono }}>{wolfWins(id)}/{timesWolf(id)} won</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Hole by hole: names fixed on the left, holes scroll sideways. */}
      <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: c.border, borderRadius: radius.md, overflow: 'hidden' }}>
        <View style={{ width: 78, borderRightWidth: 1, borderRightColor: c.border, backgroundColor: c.card }}>
          <View style={{ height: ROW, justifyContent: 'center', paddingHorizontal: 8, backgroundColor: c.brand }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>HOLE</Text>
          </View>
          {sideLabel('WOLF', c.chip, c.muted)}
          {sideLabel('PICK', c.chip, c.muted)}
          {sideLabel('WON', c.chip, c.muted)}
          {order.map((id) => (
            <View key={id} style={{ height: ROW, justifyContent: 'center', paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text numberOfLines={1} style={{ color: c.text, fontWeight: isMe(id) ? '800' : '600', fontSize: 13 }}>{first(id)}</Text>
            </View>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={{ flexDirection: 'row', backgroundColor: c.brand }}>
              {holes.map((h) => cell(<Text style={{ color: '#fff', fontWeight: '800', fontSize: 13, ...mono }}>{h.hole}</Text>, h.hole))}
              {cell(<Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>TOT</Text>, 'tot')}
            </View>
            <View style={{ flexDirection: 'row', backgroundColor: c.chip, borderTopWidth: 1, borderTopColor: c.border }}>
              {holes.map((h) => cell(<Text style={{ color: c.text, fontWeight: '700', fontSize: 11 }}>{short(h.wolfId)}</Text>, h.hole))}
              {cell(null, 'tot')}
            </View>
            <View style={{ flexDirection: 'row', backgroundColor: c.chip, borderTopWidth: 1, borderTopColor: c.border }}>
              {holes.map((h) => {
                const d = h.decision;
                const t = !d ? '–' : d.mode === 'lone' ? 'LW' : d.mode === 'blind' ? 'BW' : d.partnerId ? short(d.partnerId) : '–';
                const solo = d && d.mode !== 'partner';
                return cell(<Text style={{ color: solo ? c.danger : c.text, fontWeight: solo ? '900' : '600', fontSize: 11 }}>{t}</Text>, h.hole);
              })}
              {cell(null, 'tot')}
            </View>
            <View style={{ flexDirection: 'row', backgroundColor: c.chip, borderTopWidth: 1, borderTopColor: c.border }}>
              {holes.map((h) => {
                const t = h.result === 'wolfSide' ? 'Wolf' : h.result === 'opponents' ? 'Field' : h.result === 'tie' ? 'Tie' : '';
                return cell(
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: h.result === 'wolfSide' ? c.primary : h.result === 'opponents' ? c.accent : c.muted, fontWeight: '800', fontSize: 10 }}>{t}</Text>
                    {h.multiplier > 1 ? <Text style={{ color: c.brandGold, fontWeight: '800', fontSize: 9 }}>×{h.multiplier}</Text> : null}
                  </View>,
                  h.hole,
                );
              })}
              {cell(null, 'tot')}
            </View>
            {order.map((id) => (
              <View key={id} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.border }}>
                {holes.map((h) => {
                  const p = h.points[id] ?? 0;
                  const onWolfSide = h.wolfId === id || h.decision?.partnerId === id;
                  return cell(
                    <Text style={{ color: p > 0 ? c.primary : p < 0 ? c.under : c.muted, fontWeight: p ? '800' : '400', fontSize: 13, ...mono }}>{h.result ? (p ? signed(p) : '0') : ''}</Text>,
                    h.hole,
                    h.wolfId === id ? '#F6EFD9' : onWolfSide ? '#FBF7EC' : undefined,
                  );
                })}
                {cell(<Text style={{ color: res.points[id] < 0 ? c.under : c.primary, fontFamily: fonts.serif, fontWeight: '700', fontSize: 15 }}>{signed(res.points[id])}</Text>, 'tot', c.primarySoft)}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      <Text style={{ color: c.muted, fontSize: 12, lineHeight: 17 }}>
        PICK: the wolf’s partner, LW = lone wolf, BW = blind wolf. WON: the wolf’s side, the field, or a tie{holes.some((h) => h.multiplier > 1) ? ' (×2, ×3 when tied holes carry over)' : ''}. Shaded = the wolf (and partner) on that hole.
      </Text>
    </Card>
  );
}

/** Facts about a Wolf game for the AI story: how it works, the final points, and every hole. */
function wolfFacts(r: RoundRecord, res: WolfResult) {
  const first = (id: string) => (r.players.find((p) => p.id === id)?.name ?? '?').split(' ')[0];
  return {
    format: 'Wolf',
    howItWorks: 'Each hole one player is the wolf (rotating). The wolf picks a partner after tee shots, or goes lone wolf (alone after seeing tee shots), or blind wolf (alone before anyone tees off) for more points. The wolf side wins the hole if its best score beats the other side.',
    finalPoints: Object.fromEntries(Object.entries(res.points).sort((a, b) => b[1] - a[1]).map(([id, p]) => [first(id), p])),
    holes: res.holes.filter((h) => h.result).map((h) => ({
      hole: h.hole,
      wolf: first(h.wolfId),
      pick: !h.decision ? null : h.decision.mode === 'lone' ? 'lone wolf' : h.decision.mode === 'blind' ? 'blind wolf' : `partnered ${h.decision.partnerId ? first(h.decision.partnerId) : '?'}`,
      won: h.result === 'wolfSide' ? 'wolf side' : h.result === 'opponents' ? 'the field' : 'tied',
      multiplier: h.multiplier > 1 ? h.multiplier : undefined,
      points: Object.fromEntries(Object.entries(h.points).filter(([, p]) => p).map(([id, p]) => [first(id), p])),
    })),
  };
}

/** The story of the Wolf game: written by AI when someone taps Generate (Pro), then saved for everyone. */
export function WolfStory({ r, gi, res }: { r: RoundRecord; gi: number; res: WolfResult }) {
  const c = useColors();
  const gameId = r.games[gi].id ?? String(gi);
  const saved = r.stories?.[gameId];
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!saved && (!res.finished || r.remote?.role === 'viewer')) return null;
  const generate = async () => {
    setLoading(true);
    setFailed(false);
    const text = await requestGameStory(r, gi, wolfFacts(r, res));
    setLoading(false);
    if (!text && !justPaywalled()) setFailed(true);
  };
  return (
    <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, borderLeftWidth: 4, borderLeftColor: c.brandGold, padding: space.lg, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: c.brandGold, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>✨ THE STORY OF THE WOLF</Text>
        {loading ? <ActivityIndicator size="small" color={c.brandGold} /> : null}
      </View>
      {saved ? (
        <Text style={{ color: c.text, fontSize: 15, lineHeight: 22 }}>{saved}</Text>
      ) : (
        <>
          <Text style={{ color: c.muted, fontSize: 14 }}>Get an AI write-up of the game: who ran with the pack, who went lone wolf, and how it was won.</Text>
          <Pressable onPress={generate} disabled={loading} accessibilityRole="button"
            style={({ pressed }) => ({ alignSelf: 'flex-start', backgroundColor: c.brand, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16, opacity: pressed || loading ? 0.6 : 1 })}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{loading ? 'Writing the story…' : '✨ Generate story'}</Text>
          </Pressable>
        </>
      )}
      {failed ? <Text style={{ color: c.danger, fontSize: 12 }}>Couldn’t write it just now. Check your connection and try again.</Text> : null}
    </View>
  );
}
