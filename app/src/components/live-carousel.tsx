/**
 * Home: every match in progress, one card each, swipe left/right (dots show where you are).
 * My matches first, then the other matches in rounds I'm part of. Tap to open that match.
 */
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { canDeleteRound } from '@/components/swipe-to-delete';
import type { TipTarget } from '@/components/tip';
import { gameName, matchLabel } from '@/lib/games';
import { headline } from '@/lib/headline';
import { useMe } from '@/lib/me';
import { playersIn } from '@/lib/edit-rights';
import { courseFor, evaluate, isResult, shortCourseName } from '@/lib/round';
import type { RoundRecord } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';

type Item = { r: RoundRecord; gi: number; mine: boolean; at: number };

export function LiveCarousel({ rounds, onDelete, firstRef }: { rounds: RoundRecord[]; onDelete: (roundId: string) => void; firstRef?: TipTarget }) {
  const c = useColors();
  const { isMe } = useMe();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const cardW = Math.min(width, 640) - space.lg * 2;
  const gap = space.sm;

  const items: Item[] = [];
  for (const r of rounds) {
    const matches = r.games.map((g, i) => (matchLabel(g) ? i : -1)).filter((i) => i >= 0);
    for (const gi of matches.length > 1 ? matches : [0]) {
      items.push({ r, gi, mine: playersIn(r.games[gi]).some(isMe), at: r.createdAt });
    }
  }
  // My matches first, then the rest; newest rounds first within each.
  items.sort((a, b) => Number(b.mine) - Number(a.mine) || b.at - a.at || a.gi - b.gi);
  if (items.length === 0) return null;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardW + gap}
        decelerationRate="fast"
        disableIntervalMomentum
        contentContainerStyle={{ paddingHorizontal: space.lg, gap }}
        onScroll={(e) => setIndex(Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.x / (cardW + gap)))))}
        scrollEventThrottle={32}>
        {items.map((it, n) => {
          const { r, gi } = it;
          const res = evaluate(r)[gi];
          const head = res && isResult(res) ? headline(res, r.players) : null;
          let course = '';
          try { course = shortCourseName(courseFor(r).name).toUpperCase(); } catch { /* course missing */ }
          const label = matchLabel(r.games[gi]);
          const big = head ? (head.board ? (head.board[0] ? `${head.board[0].pos === 'T1' ? 'Tied: ' : ''}${head.board[0].name} ${head.board[0].value}${head.board[0].thru !== '–' ? ` · ${head.board[0].thru === 'F' ? 'F' : `thru ${head.board[0].thru}`}` : ''}` : '') : head.leader ? `${head.leader} ${head.big}` : head.big) : '';
          const deletable = canDeleteRound(r) && r.remote?.role !== 'viewer';
          return (
            <View key={`${r.id}-${gi}`} ref={n === 0 ? firstRef : undefined} collapsable={false} style={{ width: cardW }}>
              <Pressable onPress={() => router.push({ pathname: '/round/[id]', params: { id: r.id, match: String(gi) } })} accessibilityRole="button" accessibilityLabel={`${label ?? gameName(r.games[gi])}: ${big}. Open`}>
                {({ pressed }) => (
                  <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden', opacity: pressed ? 0.85 : 1, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
                    <View style={{ height: 3, backgroundColor: c.accent }} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', padding: space.lg, gap: space.md }}>
                      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                          <Text numberOfLines={1} style={{ flexShrink: 1, color: c.under, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>● LIVE · {course}</Text>
                          <Text style={{ color: c.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>{head?.small.toUpperCase()}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text numberOfLines={1} style={{ flexShrink: 1, color: c.muted, fontSize: 13 }}>{label ? `${label} · ${gameName(r.games[gi])}` : gameName(r.games[gi])}</Text>
                          {it.mine && (
                            <View style={{ backgroundColor: c.primarySoft, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                              <Text style={{ color: c.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>YOUR MATCH</Text>
                            </View>
                          )}
                        </View>
                        <Text numberOfLines={2} style={{ fontFamily: fonts.serif, fontSize: 24, fontWeight: '700', color: head?.side === 1 ? c.teamB : c.primary }}>{big}</Text>
                        <Text style={{ color: c.primary, fontWeight: '700', marginTop: 4 }}>{r.remote?.role === 'viewer' ? 'Follow live ›' : 'Resume scoring ›'}</Text>
                      </View>
                      {deletable && (
                        <Pressable
                          onPress={() => onDelete(r.id)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Delete this round"
                          style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: pressed ? '#8E2A24' : c.danger, alignItems: 'center', justifyContent: 'center' })}>
                          {Platform.OS === 'ios' ? <SymbolView name="trash.fill" tintColor="#fff" size={18} /> : <Text style={{ color: '#fff', fontSize: 16 }}>🗑</Text>}
                        </Pressable>
                      )}
                    </View>
                  </View>
                )}
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      {items.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space.sm }} accessibilityLabel={`Match ${index + 1} of ${items.length}. Swipe to see the others.`}>
          {items.map((it, n) => (
            <View key={`${it.r.id}-${it.gi}`} style={{ width: n === index ? 18 : 7, height: 7, borderRadius: 4, backgroundColor: n === index ? c.primary : c.border }} />
          ))}
        </View>
      )}
    </View>
  );
}
