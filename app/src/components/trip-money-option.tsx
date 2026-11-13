/**
 * Trips: the "Track Expenses" checkbox (under the dates on New Event and Edit). Clutch Up Pro: without it the option
 * is greyed out with a lock, and tapping it opens the Pro screen. Ticked, it asks the trip's currency and an optional
 * second currency to show amounts in (with its rate).
 */
import { CURRENCIES, type TripMoney } from '@golf/engine';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { openPaywall, usePro } from '@/lib/pro';
import { fonts, radius, space, useColors } from '@/theme';

export const DEFAULT_TRIP_MONEY: TripMoney = { on: false, currency: 'CAD' };

/** Rough units per US dollar, only to start the rate box near the right number (people set today's rate). */
const ROUGH: Record<string, number> = { USD: 1, CAD: 1.38, EUR: 0.92, GBP: 0.79, MXN: 18.5, AUD: 1.52 };
const roughRate = (from: string, to: string) => {
  const r = (ROUGH[to] ?? 1) / (ROUGH[from] ?? 1);
  return Number(r.toFixed(r < 0.1 ? 4 : 2));
};

function Chips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable key={o} onPress={() => onChange(o)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={o}
            style={({ pressed }) => ({ paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primarySoft : c.card, opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ color: on ? c.primary : c.text, fontWeight: '700', fontSize: 13 }}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TripMoneyOption({ value, onChange, organiserPays }: { value: TripMoney; onChange: (v: TripMoney) => void; /** Someone else organised it: their Pro covers it. */ organiserPays?: boolean }) {
  const c = useColors();
  const pro = usePro((s) => s.pro);
  const [rateText, setRateText] = useState(value.alt ? String(value.alt.rate) : '');
  // Without Pro it can't be turned on (one that's already on can still be turned off).
  const locked = !pro && !organiserPays && !value.on;
  const box = (
    <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: value.on ? c.primary : c.border, backgroundColor: value.on ? c.primary : locked ? c.chip : c.card, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
      {value.on ? <Text style={{ color: c.onPrimary, fontSize: 15, fontWeight: '900', lineHeight: 18 }}>✓</Text> : null}
    </View>
  );
  const setAlt = (cur: string) => {
    if (cur === 'None') return onChange({ ...value, alt: undefined });
    const rate = roughRate(value.currency, cur);
    setRateText(String(rate));
    onChange({ ...value, alt: { currency: cur, rate } });
  };
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.sm, gap: space.sm }}>
      <Pressable
        onPress={() => (locked ? openPaywall('expenses') : onChange({ ...value, on: !value.on }))}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: value.on, disabled: locked }}
        accessibilityLabel={locked ? 'Track expenses. Only available with Clutch Up Pro.' : 'Track expenses'}
        hitSlop={6}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ opacity: locked ? 0.45 : 1 }}>{box}</View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: locked ? 0.45 : 1 }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>Track Expenses</Text>
            <View style={{ borderWidth: 1, borderColor: c.brandGold, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: c.brandGold, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>PRO</Text>
            </View>
          </View>
          <Text style={{ color: c.muted, fontSize: 12, opacity: locked ? 0.45 : 1 }}>Log shared bills, see who owes what, and settle up. Adds an Expenses tab to the trip.</Text>
          {locked ? <Text style={{ color: c.accent, fontSize: 13, fontWeight: '700', marginTop: 4 }}>🔒 Only available with Clutch Up Pro</Text> : null}
        </View>
      </Pressable>
      {value.on ? (
        <View style={{ gap: space.sm, paddingLeft: 34 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ color: c.text, fontWeight: '600', fontSize: 14 }}>Currency</Text>
            <Chips options={[...CURRENCIES]} value={value.currency} onChange={(cur) => {
              const alt = value.alt && value.alt.currency !== cur ? { currency: value.alt.currency, rate: roughRate(cur, value.alt.currency) } : undefined;
              setRateText(alt ? String(alt.rate) : '');
              onChange({ ...value, currency: cur, alt });
            }} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: c.text, fontWeight: '600', fontSize: 14 }}>Also show amounts in</Text>
            <Chips options={['None', ...CURRENCIES.filter((x) => x !== value.currency)]} value={value.alt?.currency ?? 'None'} onChange={setAlt} />
          </View>
          {value.alt ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: c.text, fontSize: 14 }}>1 {value.currency} =</Text>
              <TextInput
                value={rateText}
                onChangeText={(t) => {
                  setRateText(t);
                  const r = Number(t);
                  if (r > 0 && value.alt) onChange({ ...value, alt: { ...value.alt, rate: r } });
                }}
                keyboardType="decimal-pad"
                accessibilityLabel={`How many ${value.alt.currency} one ${value.currency} buys`}
                style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 7, width: 80, fontSize: 15, fontFamily: fonts.serif, color: c.text, backgroundColor: c.card }}
              />
              <Text style={{ color: c.text, fontSize: 14 }}>{value.alt.currency}</Text>
              <Text style={{ color: c.muted, fontSize: 12, flex: 1 }}>Set today’s rate</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
