/**
 * Seasons: how the season is scored (Match points, or Stableford Points Race), and the Points Race settings: where the
 * 2nd half starts, how many best rounds count in each half and the season, the finishing bonus for each place
 * (edited in a pop-up), and the Stableford table. Stableford Points Race is Clutch Up Pro.
 */
import { DEFAULT_FEDEX_BONUS, defaultFedex, type FedexConfig } from '@golf/engine';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Card, Segmented, Stepper } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { openPaywall, usePro } from '@/lib/pro';
import { fonts, radius, space, useColors } from '@/theme';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const pts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "1st +12, 2nd +11 … 12th +1" */
export function describeBonus(bonus: number[]): string {
  const b = bonus.filter((x, i) => x > 0 || i === 0);
  if (!b.length) return 'No finishing bonus';
  const head = b.slice(0, 2).map((x, i) => `${ordinal(i + 1)} +${pts(x)}`).join(', ');
  return b.length > 3 ? `${head} … ${ordinal(b.length)} +${pts(b[b.length - 1])}` : b.map((x, i) => `${ordinal(i + 1)} +${pts(x)}`).join(', ');
}

function Choice({ on, title, sub, onPress, pro, locked }: { on: boolean; title: string; sub: string; onPress: () => void; pro?: boolean; locked?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: locked }} accessibilityLabel={`${title}${locked ? '. Only available with Clutch Up Pro.' : ''}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: on ? 2 : 1, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primarySoft : c.card, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.primary : c.border, alignItems: 'center', justifyContent: 'center', marginTop: 1, opacity: locked ? 0.45 : 1 }}>
        {on ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.primary }} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: locked ? 0.45 : 1 }}>
          <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{title}</Text>
          {pro ? (
            <View style={{ borderWidth: 1, borderColor: c.brandGold, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: c.brandGold, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>PRO</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18, opacity: locked ? 0.45 : 1 }}>{sub}</Text>
        {locked ? <Text style={{ color: c.accent, fontSize: 13, fontWeight: '700', marginTop: 4 }}>🔒 Only available with Clutch Up Pro</Text> : null}
      </View>
    </Pressable>
  );
}

/** Match points or Stableford Points Race. */
export function SeasonScoring({ value, onChange, defaultHalf }: { value: FedexConfig | null; onChange: (v: FedexConfig | null) => void; defaultHalf: string }) {
  const pro = usePro((s) => s.pro);
  const locked = !pro && !value;
  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ color: '#6E746B', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>HOW THE SEASON IS SCORED</Text>
      <Choice on={!value} title="Match points" sub="Win 1, halve ½ in every match. The standard season." onPress={() => onChange(null)} />
      <Choice on={!!value} pro locked={locked} title="Stableford Points Race"
        sub="Stableford every round. Each round adds a finishing bonus, and your best rounds in each half and across the season make up the standings."
        onPress={() => (locked ? openPaywall('fedex') : onChange(value ?? defaultFedex(defaultHalf)))} />
    </View>
  );
}

function BonusEditor({ open, bonus, onClose, onChange }: { open: boolean; bonus: number[]; onClose: () => void; onChange: (b: number[]) => void }) {
  const c = useColors();
  const set = (i: number, v: number) => onChange(bonus.map((x, j) => (j === i ? v : x)));
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: space.lg }}>
        <Pressable onPress={() => undefined} style={{ width: '100%', maxWidth: 360, maxHeight: '80%', backgroundColor: c.card, borderRadius: 14, overflow: 'hidden' }}>
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, gap: 2 }}>
            <Text style={{ fontFamily: fonts.serif, fontWeight: '700', fontSize: 18, color: c.text }}>Finishing bonus</Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>Points added for each place in a round. Players who tie share the bonuses of the places they cover.</Text>
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: space.lg }}>
            {bonus.map((b, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.border }}>
                <Text style={{ color: c.text, fontWeight: '600', fontSize: 15, width: 60 }}>{ordinal(i + 1)}</Text>
                <Stepper small value={b} min={0} max={100} step={0.5} format={(v) => `+${pts(v)}`} onChange={(v) => set(i, v)} />
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: c.border }}>
              <Pressable onPress={() => onChange([...bonus, 0])} hitSlop={6} accessibilityRole="button"><Text style={{ color: c.primary, fontWeight: '700' }}>+ Add a place</Text></Pressable>
              {bonus.length > 1 ? <Pressable onPress={() => onChange(bonus.slice(0, -1))} hitSlop={6} accessibilityRole="button"><Text style={{ color: c.danger, fontWeight: '700' }}>Remove last</Text></Pressable> : null}
            </View>
            <Text style={{ color: c.muted, fontSize: 12, paddingBottom: space.sm }}>Places after {ordinal(bonus.length)} get no bonus.</Text>
          </ScrollView>
          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.border }}>
            <Pressable onPress={() => onChange([...DEFAULT_FEDEX_BONUS])} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, paddingVertical: 13, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: c.muted, fontWeight: '700' }}>Reset (12 … 1)</Text>
            </Pressable>
            <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, paddingVertical: 13, alignItems: 'center', borderLeftWidth: 1, borderLeftColor: c.border, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: c.primary, fontFamily: fonts.serif, fontWeight: '700', fontSize: 16 }}>Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** The Points Race settings (only when Stableford Points Race is chosen). */
export function FedexSettings({ value, onChange, start, end, roundDates }: { value: FedexConfig; onChange: (v: FedexConfig) => void; start: string; end: string; /** Scheduled rounds (fixed schedules), to say how many fall in each half. */ roundDates: string[] }) {
  const c = useColors();
  const [bonusOpen, setBonusOpen] = useState(false);
  const half = value.half;
  const firstCount = half.kind === 'date' ? roundDates.filter((d) => d < half.date).length : Math.min(half.count, roundDates.length);
  const row = (label: string, v: number, max: number, set: (n: number) => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: c.text, fontSize: 15 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: c.muted, fontSize: 13 }}>best</Text>
        <Stepper small value={v} min={1} max={max} onChange={set} />
      </View>
    </View>
  );
  return (
    <Card style={{ gap: space.md }}>
      <Text style={{ fontFamily: fonts.serif, fontSize: 18, fontWeight: '700', color: c.text }}>Points Race settings</Text>

      <View style={{ gap: space.sm }}>
        <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>Halfway point</Text>
        <Segmented<'date' | 'rounds'>
          options={[{ value: 'date', label: 'On a date' }, { value: 'rounds', label: 'After a number of rounds' }]}
          value={half.kind}
          onChange={(k) => onChange({ ...value, half: k === 'date' ? { kind: 'date', date: roundDates[Math.floor(roundDates.length / 2)] ?? start } : { kind: 'rounds', count: Math.max(1, Math.floor(roundDates.length / 2) || 10) } })}
        />
        {half.kind === 'date' ? (
          <DateField label="2nd half starts" value={half.date} min={start} max={end} onChange={(d) => onChange({ ...value, half: { kind: 'date', date: d } })} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 15 }}>1st half is the first</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Stepper small value={half.count} min={1} max={99} onChange={(n) => onChange({ ...value, half: { kind: 'rounds', count: n } })} />
              <Text style={{ color: c.muted, fontSize: 13 }}>rounds</Text>
            </View>
          </View>
        )}
        {roundDates.length ? (
          <Text style={{ color: c.muted, fontSize: 12 }}>
            {firstCount} round{firstCount === 1 ? '' : 's'} in the 1st half, {roundDates.length - firstCount} in the 2nd (from your schedule)
            {half.kind === 'date' ? '' : roundDates[firstCount] ? ` · 2nd half starts ${formatDate(roundDates[firstCount])}` : ''}.
          </Text>
        ) : null}
      </View>

      <View style={{ gap: space.sm, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.sm }}>
        <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>Best rounds that count</Text>
        {row('1st half', value.best.first, 60, (n) => onChange({ ...value, best: { ...value.best, first: n } }))}
        {row('2nd half', value.best.second, 60, (n) => onChange({ ...value, best: { ...value.best, second: n } }))}
        {row('Full season', value.best.season, 99, (n) => onChange({ ...value, best: { ...value.best, season: n } }))}
      </View>

      <Pressable onPress={() => setBonusOpen(true)} accessibilityRole="button" accessibilityLabel={`Finishing bonus: ${describeBonus(value.bonus)}. Tap to change.`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.sm, opacity: pressed ? 0.6 : 1 })}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>Finishing bonus</Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>{describeBonus(value.bonus)}. Ties share the bonus.</Text>
        </View>
        <Text style={{ color: c.primary, fontWeight: '700' }}>Edit ›</Text>
      </Pressable>

      <View style={{ gap: space.sm, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.sm }}>
        <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>Stableford points</Text>
        <Segmented<'standard' | 'modified'> options={[{ value: 'standard', label: 'Standard' }, { value: 'modified', label: 'Modified' }]} value={value.system} onChange={(s) => onChange({ ...value, system: s })} />
      </View>
      <BonusEditor open={bonusOpen} bonus={value.bonus} onClose={() => setBonusOpen(false)} onChange={(b) => onChange({ ...value, bonus: b })} />
    </Card>
  );
}
