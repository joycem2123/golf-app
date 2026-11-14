/**
 * Home: every round in progress, one card each, swipe left/right (dots show where you are).
 * Rounds I'm playing in first. Tap to open the round on the match I'm playing in.
 */
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { roundSwipe } from '@/components/swipe-to-delete';
import type { TipTarget } from '@/components/tip';
import { gameName, matchLabel } from '@/lib/games';
import { headline } from '@/lib/headline';
import { useMe } from '@/lib/me';
import { gameId, playersIn, playsIn, usePendingRequests } from '@/lib/edit-rights';
import { RequestRow } from '@/components/edit-lock';
import { courseFor, evaluate, isResult, shortCourseName } from '@/lib/round';
import { useStore, type RoundRecord } from '@/store/store';
import { Countdown } from '@/components/countdown';
import type { CountdownTarget, PlannedItem } from '@/lib/event-calendar';
import { gameInfo } from '@/lib/games';
import { fonts, radius, space, useColors } from '@/theme';

type Item = { r: RoundRecord; gi: number; mine: boolean; followed: boolean; matches: number; at: number };
export type CarouselItem = Pick<Item, 'r' | 'gi' | 'mine' | 'followed'>;

export function LiveCarousel({ rounds, onDelete, firstRef, today = [], countdown = null, gameFor, followedGames, include }: {
  rounds: RoundRecord[];
  /** The match to show for a round (a friend's match I follow); null = the one I'm playing in. */
  gameFor?: (r: RoundRecord) => number | null;
  /** Matches I follow in a round (each gets its own card, even in a round I'm playing in). */
  followedGames?: (r: RoundRecord) => number[];
  /** Which cards to show (Home's My games / Friends / All switch). */
  include?: (it: CarouselItem) => boolean;
  onDelete: (roundId: string) => void;
  firstRef?: TipTarget;
  /** Event rounds planned for today: "Start round" cards, first. */
  today?: PlannedItem[];
  /** The next event or round to look forward to: a countdown card, last. */
  countdown?: CountdownTarget | null;
}) {
  const c = useColors();
  const { isMe } = useMe();
  const events = useStore((s) => s.events);
  const uid = useStore((s) => s.me);
  // Requests from others to enter scores in my matches: answered right here on the card.
  const { pending, reload } = usePendingRequests(uid ? rounds.filter((r) => r.remote).map((r) => r.id) : []);
  const toAnswer = (r: RoundRecord) =>
    pending.filter((q) => q.round_id === r.id && q.requester !== uid && r.games.some((_, i) => gameId(r, i) === q.game_id && playsIn(r, i, { uid, isMe })));
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const cardW = Math.min(width, 640) - space.lg * 2;
  const gap = space.sm;

  const items: Item[] = [];
  for (const r of rounds) {
    const followed = followedGames?.(r) ?? [];
    const pick = gameFor?.(r);
    const gi = pick ?? myMatchIndex(r, isMe);
    const matches = r.games.filter((g) => matchLabel(g)).length;
    const mine = !!r.games[gi] && playersIn(r.games[gi]).some(isMe);
    const all: Item[] = [{ r, gi, mine, followed: followed.includes(gi) || (pick != null && !mine), matches, at: r.createdAt }];
    // Other matches I follow in this round: a card each.
    for (const f of followed) if (f !== gi && r.games[f]) all.push({ r, gi: f, mine: playersIn(r.games[f]).some(isMe), followed: true, matches, at: r.createdAt });
    items.push(...all.filter((it) => !include || include(it)));
  }
  // Rounds I'm playing in first; newest first within each.
  items.sort((a, b) => Number(b.mine) - Number(a.mine) || b.at - a.at);
  const total = today.length + items.length + (countdown ? 1 : 0);
  if (total === 0) return null;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardW + gap}
        decelerationRate="fast"
        disableIntervalMomentum
        contentContainerStyle={{ paddingHorizontal: space.lg, gap }}
        onScroll={(e) => setIndex(Math.max(0, Math.min(total - 1, Math.round(e.nativeEvent.contentOffset.x / (cardW + gap)))))}
        scrollEventThrottle={32}>
        {today.map((t, n) => (
          <View key={`today-${t.id}`} ref={n === 0 ? firstRef : undefined} collapsable={false} style={{ width: cardW }}>
            <TodayCard item={t} />
          </View>
        ))}
        {items.map((it, i) => {
          const n = i + today.length;
          const { r, gi } = it;
          const res = evaluate(r)[gi];
          const head = res && isResult(res) ? headline(res, r.players) : null;
          let course = '';
          try { course = shortCourseName(courseFor(r).name); } catch { /* course missing */ }
          // Part of an event: the event's name up top, the course on the line below.
          const eventName = r.eventId ? events.find((e) => e.id === r.eventId)?.name : undefined;
          const game = it.matches > 1 ? `${gameName(r.games[gi])} · ${it.matches}\u00a0matches` : gameName(r.games[gi]);
          const label = matchLabel(r.games[gi]);
          // First names only ("Jacob & John 1 UP"), so the score always fits on one line.
          const big = head ? (head.board ? (head.board[0] ? `${head.board[0].pos === 'T1' ? 'Tied: ' : ''}${firstNames(head.board[0].name)} ${head.board[0].value}` : '') : head.leader ? `${firstNames(head.leader)} ${head.big}` : head.big) : '';
          // How far along: "thru 7", or "not started".
          const progress = head ? (head.board?.[0] && head.board[0].thru !== '–' ? (head.board[0].thru === 'F' ? 'finished' : `thru ${head.board[0].thru}`) : head.small.toLowerCase()) : '';
          // The organiser can delete a live round; anyone else can hide it from their Home.
          const deletable = !it.followed;
          const swipe = roundSwipe(r);
          const asks = toAnswer(r);
          return (
            <View key={`${r.id}:${gi}`} ref={n === 0 ? firstRef : undefined} collapsable={false} style={{ width: cardW }}>
              {/* Every card as tall as the tallest, so swiping never jumps. */}
              <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/round/[id]', params: { id: r.id, match: String(gi) } })} accessibilityRole="button" accessibilityLabel={`${label ?? gameName(r.games[gi])}: ${big}. Open`}>
                {({ pressed }) => (
                  <View style={{ flex: 1, backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden', opacity: pressed ? 0.85 : 1, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
                    <View style={{ height: 3, backgroundColor: c.accent }} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', padding: space.lg, gap: space.md }}>
                      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text numberOfLines={1} style={{ flexShrink: 1, color: c.under, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>● LIVE · {(eventName ?? course).toUpperCase()}</Text>
                          {asks.length > 0 && (
                            <View accessibilityLabel={`${asks.length} request${asks.length > 1 ? 's' : ''} to answer`} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
                              {Platform.OS === 'ios' ? <SymbolView name="bell.fill" tintColor="#fff" size={11} /> : <Text style={{ fontSize: 10 }}>🔔</Text>}
                              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{asks.length}</Text>
                            </View>
                          )}
                        </View>
                        <Text numberOfLines={1} style={{ color: c.muted, fontSize: 13 }}>
                          {[eventName && course ? course : '', game, progress].filter(Boolean).join(' · ')}
                        </Text>
                        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontFamily: fonts.serif, fontSize: 24, fontWeight: '700', color: head?.side === 1 ? c.teamB : c.primary }}>{big}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, minHeight: 20 }}>
                          <Text style={{ color: c.primary, fontWeight: '700' }}>{r.remote?.role === 'viewer' || (it.followed && !it.mine) ? 'Follow live ›' : 'Resume scoring ›'}</Text>
                          {it.followed && (
                            <View style={{ backgroundColor: c.accent, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>★ FOLLOWING{label && it.matches > 1 ? ` · ${label.toUpperCase()}` : ''}</Text>
                            </View>
                          )}
                          {it.mine && !it.followed && it.matches > 1 && label && (
                            <View style={{ backgroundColor: c.primarySoft, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                              <Text style={{ color: c.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>YOUR MATCH: {label.toUpperCase()}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {deletable && (
                        <Pressable
                          onPress={() => onDelete(r.id)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={swipe === 'delete' ? 'Delete this round' : 'Hide this round'}
                          style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: swipe === 'delete' ? (pressed ? '#8E2A24' : c.danger) : pressed ? '#555' : '#6E746B', alignItems: 'center', justifyContent: 'center' })}>
                          {Platform.OS === 'ios' ? <SymbolView name={swipe === 'delete' ? 'trash.fill' : 'eye.slash.fill'} tintColor="#fff" size={18} /> : <Text style={{ color: '#fff', fontSize: 16 }}>{swipe === 'delete' ? '🗑' : '👁'}</Text>}
                        </Pressable>
                      )}
                    </View>
                    {asks.length > 0 && (
                      <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.primarySoft, paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {Platform.OS === 'ios' ? <SymbolView name="bell.badge.fill" tintColor={c.accent} size={16} /> : <Text style={{ fontSize: 14 }}>🔔</Text>}
                          <Text style={{ color: c.text, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>NEEDS YOUR OK</Text>
                        </View>
                        {asks.map((q) => <RequestRow key={q.id} r={r} q={q} onDone={reload} />)}
                      </View>
                    )}
                  </View>
                )}
              </Pressable>
            </View>
          );
        })}
        {countdown && (
          <Pressable key="countdown" onPress={() => router.push(`/event/${countdown.event.id}`)} accessibilityRole="button" style={{ width: cardW }}>
            <Countdown target={countdown} compact />
          </Pressable>
        )}
      </ScrollView>
      {total > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space.sm }} accessibilityLabel={`Card ${index + 1} of ${total}. Swipe to see the others.`}>
          {Array.from({ length: total }, (_, n) => (
            <View key={n} style={{ width: n === index ? 18 : 7, height: 7, borderRadius: 4, backgroundColor: n === index ? c.primary : c.border }} />
          ))}
        </View>
      )}
    </View>
  );
}

/** The match I'm playing in (the first one, if several), else the round's first match. */
export function myMatchIndex(r: RoundRecord, isMe: (id: string) => boolean): number {
  const matches = r.games.map((g, i) => (matchLabel(g) ? i : -1)).filter((i) => i >= 0);
  const list = matches.length ? matches : r.games.map((_, i) => i);
  return list.find((i) => playersIn(r.games[i]).some(isMe)) ?? list[0] ?? 0;
}

/** "Jacob Smith & John Smith" → "Jacob & John". */
const firstNames = (names: string) => names.split(' & ').map((n) => n.trim().split(' ')[0]).join(' & ');

/** An event round planned for today: tap Start round to set up what isn't set yet. */
function TodayCard({ item }: { item: PlannedItem }) {
  const c = useColors();
  const plan = item.kind === 'round' ? item.event.rounds?.find((x) => x.id === item.id) : undefined;
  const fmt = plan?.draft ? gameInfo(plan.draft.kind).name : undefined;
  const matches = plan?.matchupsLater ? 'Matchups on the day' : plan?.draft?.matches.length ? `${plan.draft.matches.length} match${plan.draft.matches.length === 1 ? '' : 'es'}` : undefined;
  const start = () => router.push({ pathname: '/new-round', params: item.params });
  return (
    <Pressable onPress={start} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`${item.event.name} ${item.title} is today. Start round`}>
      {({ pressed }) => (
        <View style={{ flex: 1, backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 2, borderColor: c.brandGold, overflow: 'hidden', opacity: pressed ? 0.85 : 1, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
          <View style={{ height: 3, backgroundColor: c.accent }} />
          <View style={{ flex: 1, padding: space.lg, gap: 4, justifyContent: 'center' }}>
            <Text numberOfLines={1} style={{ color: c.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>📅 TODAY · {item.event.name.toUpperCase()}</Text>
            <Text numberOfLines={1} style={{ color: c.muted, fontSize: 13 }}>{[item.title, fmt, matches].filter(Boolean).join(' · ')}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: fonts.serif, fontSize: 24, fontWeight: '700', color: c.primary }}>Game day! ⛳</Text>
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              <View style={{ backgroundColor: c.primary, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 16 }}>
                <Text style={{ color: c.onPrimary, fontWeight: '800', fontSize: 14 }}>Start round ›</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}
