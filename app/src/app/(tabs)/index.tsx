import { useRef } from 'react';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameSections } from '@/components/game-sections';
import { LegacyClaimCard } from '@/components/legacy-claim';
import { useDeleteWithUndo } from '@/components/swipe-to-delete';
import { HandicapReminder } from '@/components/handicap-reminder';
import { LogoMark, Wordmark } from '@/components/logo';
import { Body, Card, H2, Label } from '@/components/ui';
import { matchLabel } from '@/lib/games';
import { useMe } from '@/lib/me';
import { useFriendRequests } from '@/sync/friends';
import { useStore } from '@/store/store';
import { fonts, radius, space, useColors } from '@/theme';
import { Tip, type TipTarget } from '@/components/tip';
import { LiveCarousel } from '@/components/live-carousel';
import { nextCountdown, plannedToday } from '@/lib/event-calendar';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Tile({ title, sub, icon, onPress, primary, wide }: { title: string; sub: string; icon: ReactNode; onPress: () => void; primary?: boolean; wide?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexBasis: wide ? '100%' : '48%', flexGrow: 1, opacity: pressed ? 0.75 : 1 })}>
      <View
        style={{
          backgroundColor: primary ? c.primary : c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: primary ? c.primary : c.border,
          flex: 1, padding: space.lg, gap: 6, minHeight: wide ? 0 : 112,
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
  // The event calendar: rounds planned for today (Start round), and a countdown to what's next.
  const todays = plannedToday(events, rounds);
  const countdown = nextCountdown(events, rounds);
  const banner = active.length + todays.length + (countdown ? 1 : 0) > 0;
  const { me: myPlayer } = useMe();
  const incoming = useFriendRequests((s) => s.incoming);
  const requestCount = incoming.length;
  const requestName = incoming[0]?.display_name || incoming[0]?.username || 'Someone';
  const { deleteRound, deleteEvent, bar } = useDeleteWithUndo();
  const liveRef: TipTarget = useRef(null);
  const firstOpenRef: TipTarget = useRef(null);
  const firstName = myPlayer ? myPlayer.name.split(' ')[0] : me && names[me] ? names[me].split(' ')[0] : null;

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: space.xl * 3 }}>
      {/* Banner */}
      <View style={{ backgroundColor: c.brand, paddingTop: insets.top + space.md, paddingHorizontal: space.lg, paddingBottom: space.xl + (banner ? 56 : 0) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <LogoMark size={46} />
          <Wordmark size={30} color="#FFFFFF" />
        </View>
        <View style={{ height: 1, backgroundColor: c.brandGold, opacity: 0.6, marginVertical: space.lg }} />
        <Text style={{ color: '#ffffffcc', fontSize: 14, letterSpacing: 0.5 }}>{greeting()}{firstName ? `, ${firstName}` : ''}</Text>
        <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 26, fontWeight: '700', marginTop: 2 }}>
          {todays.length ? 'It’s game day!' : active.length ? (active.length > 1 || active[0].games.filter((g) => matchLabel(g)).length > 1 ? 'Matches in play' : 'You have a round in play') : countdown ? 'Something to look forward to' : 'Ready for a match?'}
        </Text>
      </View>

      {/* Live round, overlapping the banner */}
      {/* Every match in progress: swipe between them (mine first). */}
      {banner && (
        <View style={{ marginTop: -56 }}>
          <LiveCarousel rounds={active} onDelete={deleteRound} firstRef={liveRef} today={todays} countdown={countdown} />
        </View>
      )}

      <View style={{ padding: space.lg, gap: space.lg }}>
        <LegacyClaimCard />
        <HandicapReminder />
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
          {/* Upload a scorecard: the other way to start a round, so it sits right under New Round, in deep green and gold. */}
          <Pressable
            onPress={() => router.push('/upload-scorecard')}
            accessibilityRole="button"
            accessibilityLabel="Upload a scorecard: turn a photo of a finished card into a round"
            style={({ pressed }) => ({
              flexBasis: '100%', flexDirection: 'row', alignItems: 'center', gap: space.md,
              backgroundColor: c.brand, borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.brandGold,
              paddingVertical: space.md, paddingHorizontal: space.lg, opacity: pressed ? 0.8 : 1,
              shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
            })}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandGold, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 19 }}>📷</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontFamily: fonts.serif, fontWeight: '700', fontSize: 17 }}>Upload a Scorecard</Text>
              <Text style={{ color: '#ffffffbb', fontSize: 12 }}>Played without the app? Snap the card for instant results.</Text>
            </View>
            <Text style={{ color: c.brandGold, fontSize: 26, fontWeight: '700' }}>›</Text>
          </Pressable>
          <Tile title="Join with Code" sub="Follow live or keep score" icon={glyph('#', c.primary)} onPress={() => router.push('/join')} />
          <Tile title="Friends" sub="Your group & handicaps" icon={glyph('☺', c.primary)} onPress={() => router.push('/friends')} />
        </View>

        <GameSections skipRoundIds={active.map((x) => x.id)} completedLimit={3} hideEventRounds onDeleteRound={deleteRound} onDeleteEvent={deleteEvent} firstOpenRef={firstOpenRef} />

        {rounds.length === 0 && events.length === 0 && (
          <Card>
            <H2>Welcome to Clutch Up Golf</H2>
            <Body muted>Start a round to pick a course, add your group and choose your games. Scores save on your phone, even without signal.</Body>
          </Card>
        )}
      </View>
    </ScrollView>
    {/* Live matches: swipe between them. Other live/upcoming cards: swipe left to delete. */}
    {active.length > 0 ? (
      <Tip
        id="home-live"
        target={liveRef}
        title="Your live rounds"
        lines={['Swipe left or right to see every round in play; yours come first.', 'Tap a round to open it on your match. The red bin deletes the round.']}
      />
    ) : (
      <Tip
        id="home-swipe"
        when={rounds.length + events.length > 0}
        target={firstOpenRef}
        title="Swipe left to delete"
        lines={['Slide a live or upcoming card to the left to delete it. You’ll have a few seconds to undo.']}
      />
    )}
    {bar}
    </View>
  );
}
