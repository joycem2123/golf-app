import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Pressable as GHPressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventCard, RoundCard } from '@/components/cards';
import { LegacyClaimCard } from '@/components/legacy-claim';
import { SwipeToDelete, useDeleteWithUndo } from '@/components/swipe-to-delete';
import { LogoMark, Wordmark } from '@/components/logo';
import { Body, Card, H2, Label } from '@/components/ui';
import { gameName } from '@/lib/games';
import { headline } from '@/lib/headline';
import { courseFor, evaluate, isResult, shortCourseName } from '@/lib/round';
import { useMe } from '@/lib/me';
import { useFriendRequests } from '@/sync/friends';
import { useStore } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Tile({ title, sub, icon, onPress, primary }: { title: string; sub: string; icon: ReactNode; onPress: () => void; primary?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexBasis: '48%', flexGrow: 1, opacity: pressed ? 0.75 : 1 })}>
      <View
        style={{
          backgroundColor: primary ? c.primary : c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: primary ? c.primary : c.border,
          padding: space.lg, gap: 6, minHeight: 112,
          shadowColor: '#3B3423', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
        }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: primary ? '#ffffff22' : c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <Text style={{ fontFamily: fonts.serif, fontSize: 17, fontWeight: '700', color: primary ? '#fff' : c.text }}>{title}</Text>
        <Text style={{ fontSize: 12, color: primary ? '#ffffffbb' : c.muted }}>{sub}</Text>
      </View>
    </Pressable>
  );
}

const glyph = (t: string, color: string) => <Text style={{ fontSize: 17, color, fontWeight: '700' }}>{t}</Text>;

export default function Home() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const rounds = useStore((s) => s.rounds);
  const events = useStore((s) => s.events);
  const me = useStore((s) => s.me);
  const names = useStore((s) => s.names);
  const active = rounds.filter((r) => r.status === 'active');
  const recent = rounds.filter((r) => r.status === 'complete').slice(0, 3);
  const live = active[0];
  const liveResult = live ? evaluate(live)[0] : undefined;
  const liveHead = live && liveResult && isResult(liveResult) ? headline(liveResult, live.players) : null;
  const { me: myPlayer } = useMe();
  const incoming = useFriendRequests((s) => s.incoming);
  const requestCount = incoming.length;
  const requestName = incoming[0]?.display_name || incoming[0]?.username || 'Someone';
  const { deleteRound, deleteEvent, bar } = useDeleteWithUndo();
  const firstName = myPlayer ? myPlayer.name.split(' ')[0] : me && names[me] ? names[me].split(' ')[0] : null;

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: space.xl * 3 }}>
      {/* Banner */}
      <View style={{ backgroundColor: c.primary, paddingTop: insets.top + space.md, paddingHorizontal: space.lg, paddingBottom: space.xl + (live ? 56 : 0) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <LogoMark size={44} />
          <Wordmark size={30} color="#FFFFFF" />
        </View>
        <View style={{ height: 1, backgroundColor: c.accent, opacity: 0.6, marginVertical: space.lg }} />
        <Text style={{ color: '#ffffffcc', fontSize: 14, letterSpacing: 0.5 }}>{greeting()}{firstName ? `, ${firstName}` : ''}</Text>
        <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 26, fontWeight: '700', marginTop: 2 }}>
          {live ? 'You have a round in play' : 'Ready for a match?'}
        </Text>
      </View>

      {/* Live round, overlapping the banner */}
      {live && (
        <View style={{ marginHorizontal: space.lg, marginTop: -56 }}>
        <SwipeToDelete label="round" onDelete={() => deleteRound(live.id)}>
        <GHPressable onPress={() => router.push(`/round/${live.id}`)}>
          <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
            <View style={{ height: 3, backgroundColor: c.accent }} />
            <View style={{ padding: space.lg, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: c.under, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>● LIVE · {shortCourseName(courseFor(live).name).toUpperCase()}</Text>
                <Text style={{ color: c.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>{liveHead?.small.toUpperCase()}</Text>
              </View>
              <Text style={{ color: c.muted, fontSize: 13 }}>{gameName(live.games[0])}</Text>
              <Text style={{ fontFamily: fonts.serif, fontSize: 24, fontWeight: '700', color: liveHead?.side === 1 ? c.teamB : c.primary }}>
                {liveHead ? (liveHead.leader ? `${liveHead.leader} ${liveHead.big}` : liveHead.big) : ''}
              </Text>
              <Text style={{ color: c.primary, fontWeight: '700', marginTop: 4 }}>Resume scoring ›</Text>
            </View>
          </View>
        </GHPressable>
        </SwipeToDelete>
        </View>
      )}

      <View style={{ padding: space.lg, gap: space.lg }}>
        <LegacyClaimCard />
        {requestCount > 0 && (
          <Pressable onPress={() => router.push('/friends')}>
            <Card style={{ borderLeftWidth: 4, borderLeftColor: c.accent, flexDirection: 'row', alignItems: 'center' }}>
              <Body bold style={{ flex: 1 }}>
                {requestCount === 1 ? `${requestName} wants to be friends` : `${requestCount} friend requests`}
              </Body>
              <Text style={{ color: c.primary, fontWeight: '700' }}>View ›</Text>
            </Card>
          </Pressable>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          <Tile primary title="New Round" sub="Pick a course, players and games" icon={glyph('+', '#fff')} onPress={() => router.push('/new-round')} />
          <Tile title="New Event" sub="Trip, Ryder Cup or season" icon={glyph('🏆', c.primary)} onPress={() => router.push('/new-event')} />
          <Tile title="Join with Code" sub="Follow live or keep score" icon={glyph('#', c.primary)} onPress={() => router.push('/join')} />
          <Tile title="Friends" sub="Your group & handicaps" icon={glyph('☺', c.primary)} onPress={() => router.push('/friends')} />
        </View>

        {events.length > 0 && (
          <View style={{ gap: space.sm }}>
            <Label>Events</Label>
            {events.map((e) => (
              <SwipeToDelete key={e.id} label={`event ${e.name}`} onDelete={() => deleteEvent(e.id)}>
                <EventCard e={e} rounds={rounds} />
              </SwipeToDelete>
            ))}
          </View>
        )}

        {active.length > 1 && (
          <View style={{ gap: space.sm }}>
            <Label>Also in progress</Label>
            {active.slice(1).map((r) => (
              <SwipeToDelete key={r.id} label="round" onDelete={() => deleteRound(r.id)}>
                <RoundCard r={r} />
              </SwipeToDelete>
            ))}
          </View>
        )}

        {recent.length > 0 && (
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Label>Recent results</Label>
              <Pressable onPress={() => router.push('/scores')}><Label style={{ color: c.primary }}>See all ›</Label></Pressable>
            </View>
            {recent.map((r) => (
              <SwipeToDelete key={r.id} label="round" onDelete={() => deleteRound(r.id)}>
                <RoundCard r={r} />
              </SwipeToDelete>
            ))}
          </View>
        )}

        {rounds.length === 0 && events.length === 0 && (
          <Card>
            <H2>Welcome to MatchDay</H2>
            <Body muted>Start a round to pick a course, add your group and choose your games. Scores save on your phone, even without signal.</Body>
          </Card>
        )}
      </View>
    </ScrollView>
    {bar}
    </View>
  );
}
