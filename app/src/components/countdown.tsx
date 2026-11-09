/**
 * Countdown to an event (or its next round): big ticking digits and a line that builds the hype as the day gets closer.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';

import { formatDate } from '@/lib/dates';
import { msUntil, type CountdownTarget } from '@/lib/event-calendar';
import { fonts, radius, space, useColors } from '@/theme';

const pad2 = (n: number) => String(Math.max(0, n)).padStart(2, '0');

/** What to say, by how close it is. */
function hype(days: number, kind: 'event' | 'round', what: string): string {
  if (kind === 'round') {
    if (days >= 7) return `${what} is on the calendar. Keep that swing warm.`;
    if (days >= 1) return `${what} is coming. Settle the pairings and the trash talk.`;
    return `${what} is tomorrow. Charge the phone, pack the balls, get some sleep.`;
  }
  if (days >= 60) return 'Mark the calendar. The group chat should already be heating up.';
  if (days >= 30) return 'Book the range time. Every practice swing counts now.';
  if (days >= 14) return 'A few weeks out. Who’s bringing the trophy home?';
  if (days >= 7) return 'Less than two weeks. Dust off the clubs and find that swing.';
  if (days >= 3) return 'Under a week to go. Start the trash talk, nobody’s backing down.';
  if (days >= 1) return 'Clean the clubs. Check the weather. It’s almost here.';
  return 'Tomorrow! Lay out the outfit, set the alarm, bring your A game.';
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Digit({ value, label, pulse }: { value: string; label: string; pulse?: Animated.Value }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', gap: 3, flex: 1 }}>
      <Animated.View
        style={{
          alignSelf: 'stretch', alignItems: 'center', paddingVertical: 6, borderRadius: radius.md, backgroundColor: '#ffffff14',
          borderWidth: 1, borderColor: c.brandGold, transform: pulse ? [{ scale: pulse }] : undefined,
        }}>
        <Text style={{ color: '#fff', fontFamily: fonts.serif, fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Text>
        {/* The "flip" line across the middle of each digit card. */}
        <View style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, backgroundColor: '#00000040' }} />
      </Animated.View>
      <Text style={{ color: c.brandGold, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }}>{label}</Text>
    </View>
  );
}

export function Countdown({ target, compact }: { target: CountdownTarget; compact?: boolean }) {
  const c = useColors();
  useNow(); // re-render every second
  const ms = msUntil(target.date);
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hrs = Math.floor((total % 86400) / 3600);
  const min = Math.floor((total % 3600) / 60);
  const sec = total % 60;

  // The seconds card gives a little beat every tick.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1.06, duration: 120, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [sec, pulse]);

  const title = target.kind === 'event' ? target.event.name : target.label;
  const what = target.kind === 'event' ? target.event.name : target.label.split(' · ').pop() ?? 'The round';
  return (
    <View accessibilityLabel={`${title} starts in ${days} days ${hrs} hours ${min} minutes`}
      style={{ backgroundColor: c.brand, borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.brandGold, overflow: 'hidden', padding: compact ? space.md : space.lg, gap: compact ? 8 : space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: compact ? 16 : 20 }}>{target.kind === 'event' ? '🏆' : '⛳'}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: c.brandGold, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>
            {target.kind === 'event' ? 'COUNTDOWN TO TEE OFF' : 'NEXT ROUND'} · {formatDate(target.date, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
          </Text>
          <Text numberOfLines={1} style={{ color: '#fff', fontFamily: fonts.serif, fontSize: compact ? 19 : 24, fontWeight: '700' }}>{title}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Digit value={pad2(days)} label={days === 1 ? 'DAY' : 'DAYS'} />
        <Digit value={pad2(hrs)} label="HRS" />
        <Digit value={pad2(min)} label="MIN" />
        <Digit value={pad2(sec)} label="SEC" pulse={pulse} />
      </View>
      <Text numberOfLines={2} style={{ color: '#ffffffd9', fontSize: 13, fontStyle: 'italic', textAlign: 'center' }}>
        {total === 0 ? 'It’s here. Let’s play!' : hype(days, target.kind, what)}
      </Text>
    </View>
  );
}
