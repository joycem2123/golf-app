/**
 * Add (or change) a trip expense: what it was, how much, who paid (one person, or split between payers), and who
 * shares it (everyone by default; tap to leave someone out, press and hold for ×2 when they bring a guest).
 */
import { AccountNeeded, useIsGuest } from '@/components/account-needed';
import { centsText, formatMoney, parseCents, splitCents, type TripExpense, type TripMoney } from '@golf/engine';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { addedByMe, adderName, shortNamer } from '@/components/trip-expenses';
import { MultiSelect } from '@/components/select';
import { Button, Card, Field, Label } from '@/components/ui';
import { today } from '@/lib/dates';
import { useMe } from '@/lib/me';
import { newId, useEvent, useStore } from '@/store/store';
import { removeEntry, saveEntry, useTripLedger, type LedgerEntry } from '@/sync/trip-ledger';
import { fonts, radius, space, useColors } from '@/theme';

export { ErrorBoundary } from '@/components/error-screen';

function Person({ label, on, weight, onPress, onLongPress }: { label: string; on: boolean; weight?: number; onPress: () => void; onLongPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
      accessibilityLabel={`${label}${weight && weight > 1 ? `, counts ×${weight}` : ''}`} accessibilityHint={onLongPress ? 'Tap again to count them ×2, ×3 or ×4. Press and hold to leave them out.' : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primarySoft : c.chip, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: on ? c.primary : c.muted, fontWeight: '600', fontSize: 14, textDecorationLine: on ? 'none' : 'line-through' }}>{label}</Text>
      {on && weight && weight > 1 ? (
        <View style={{ backgroundColor: c.primary, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 }}>
          <Text style={{ color: c.onPrimary, fontSize: 11, fontWeight: '800' }}>×{weight}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function ExpenseScreenScreen() {
  // Guests can only follow: starting things needs an account.
  return useIsGuest() ? <AccountNeeded what="add trip expenses" title="Add Expense" /> : <ExpenseScreen />;
}

function ExpenseScreen() {
  const c = useColors();
  const { id, expense } = useLocalSearchParams<{ id: string; expense?: string }>();
  const e = useEvent(id);
  const existing = useTripLedger((s) => s.byEvent[id]?.find((x) => x.id === expense && x.kind === 'expense')) as (LedgerEntry & TripExpense) | undefined;
  const players = useStore((s) => s.players);
  const { isMe } = useMe();
  const money = (e?.expenses ?? { on: true, currency: 'CAD' }) as TripMoney;
  const people = e?.playerIds ?? [];
  const me = people.find(isMe);
  const short = shortNamer(people, players);
  const name = (pid: string) => (isMe(pid) ? 'Me' : short(pid));

  const defaultDate = () => {
    const t = today();
    if (!e?.startDate) return t;
    if (t < e.startDate) return e.startDate;
    if (e.endDate && t > e.endDate) return e.endDate;
    return t;
  };
  const [title, setTitle] = useState(existing?.title ?? '');
  const [amountText, setAmountText] = useState(existing ? centsText(existing.amount) : '');
  const [currency, setCurrency] = useState(existing?.currency ?? money.currency);
  const [date, setDate] = useState(existing?.date ?? defaultDate());
  // Who paid: one person, or several (then each says how much).
  const [payers, setPayers] = useState<string[]>(() => (existing ? Object.keys(existing.paidBy) : [me ?? people[0]].filter(Boolean) as string[]));
  const splitPay = payers.length > 1;
  const payer = payers[0];
  const [payParts, setPayParts] = useState<Record<string, string>>(() => (existing && Object.keys(existing.paidBy).length > 1 ? Object.fromEntries(Object.entries(existing.paidBy).map(([k, v]) => [k, centsText(v)])) : {}));
  const [shares, setShares] = useState<Record<string, number>>(() => existing?.shares ?? Object.fromEntries(people.map((p) => [p, 1])));
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const amount = parseCents(amountText);
  const partsCents = Object.fromEntries(Object.entries(payParts).filter(([k]) => payers.includes(k)).map(([k, v]) => [k, parseCents(v) ?? 0]).filter(([, v]) => (v as number) > 0)) as Record<string, number>;
  const partsSum = Object.values(partsCents).reduce((a, b) => a + b, 0);
  const sharers = Object.keys(shares).filter((k) => shares[k] > 0);
  const perShare = useMemo(() => (amount && sharers.length ? splitCents(amount, shares, existing?.id ?? 'new') : {}), [amount, shares, sharers.length, existing?.id]);
  const fmt = (cents: number) => formatMoney(cents, currency);

  const problem = !title.trim()
    ? 'Say what it was for.'
    : !amount
      ? 'Enter the amount.'
      : splitPay && Object.keys(partsCents).length === 0
        ? 'Enter how much each person paid.'
        : splitPay && partsSum !== amount
          ? `The payments add up to ${fmt(partsSum)}, not ${fmt(amount)}.`
          : !splitPay && !payer
            ? 'Pick who paid.'
            : sharers.length === 0
              ? 'Pick at least one person to share it.'
              : null;

  if (!e || !e.expenses) return null;
  // Only the person who added a bill can change it.
  if (existing && !addedByMe(existing, useStore.getState().me))
    return (
      <View style={{ padding: space.lg, gap: space.md }}>
        <Stack.Screen options={{ title: existing.title }} />
        <Card><Text style={{ color: c.text, fontSize: 15 }}>Only {adderName((existing as LedgerEntry).addedBy)}, who added this expense, can change or delete it.</Text></Card>
      </View>
    );

  // Tap: include them, then ×2, ×3, ×4 (guests) and back to ×1. Hold: leave them out.
  const tapShare = (pid: string) => setShares((s) => ({ ...s, [pid]: !s[pid] ? 1 : s[pid] >= 4 ? 1 : s[pid] + 1 }));
  const dropShare = (pid: string) => setShares((s) => ({ ...s, [pid]: 0 }));
  const everyone = () => setShares(Object.fromEntries(people.map((p) => [p, 1])));
  const justOne = (pid: string) => setShares(Object.fromEntries(people.map((p) => [p, p === pid ? 1 : 0])));

  const save = async () => {
    setTried(true);
    if (problem || busy || !amount) return;
    setBusy(true);
    const entry: TripExpense = {
      id: existing?.id ?? newId(),
      kind: 'expense',
      title: title.trim(),
      amount,
      currency,
      date,
      paidBy: splitPay ? partsCents : { [payer]: amount },
      shares: Object.fromEntries(Object.entries(shares).filter(([, w]) => w > 0)),
    };
    try {
      await saveEntry(e.id, entry);
      router.back();
    } catch (err) {
      Alert.alert('Couldn’t save the expense', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };
  const remove = () =>
    Alert.alert('Delete this expense?', 'Everyone’s balances will be worked out again without it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeEntry(e.id, existing!.id);
            router.back();
          } catch (err) {
            Alert.alert('Couldn’t delete it', err instanceof Error ? err.message : 'Try again.');
          }
        },
      },
    ]);

  const currencies = money.alt ? [money.currency, money.alt.currency] : [money.currency];
  const weights = Object.values(shares).reduce((a, w) => a + w, 0);
  const one = amount && weights ? Math.floor(amount / weights) : 0;
  const multiplied = sharers.filter((p) => shares[p] > 1);

  return (
    <>
      <Stack.Screen options={{ title: existing ? 'Edit Expense' : 'Add Expense' }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Field label="What for" value={title} onChangeText={setTitle} placeholder="e.g. Silverrock green fees" autoCapitalize="sentences" error={tried && !title.trim() ? 'Say what it was for' : null} />
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Field label="Amount" value={amountText} onChangeText={setAmountText} placeholder="0.00" keyboardType="decimal-pad" error={tried && !amount ? 'Enter the amount' : null} />
          </View>
          {currencies.length > 1 ? (
            <View style={{ flexDirection: 'row', gap: 4, paddingBottom: 6 }}>
              {currencies.map((cur) => (
                <Pressable key={cur} onPress={() => setCurrency(cur)} accessibilityRole="radio" accessibilityState={{ selected: cur === currency }}
                  style={{ paddingHorizontal: 10, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: cur === currency ? c.primary : c.border, backgroundColor: cur === currency ? c.primarySoft : c.card }}>
                  <Text style={{ color: cur === currency ? c.primary : c.muted, fontWeight: '700' }}>{cur}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={{ color: c.muted, fontWeight: '700', paddingBottom: 16 }}>{currency}</Text>
          )}
        </View>
        <DateField label="Date" value={date} onChange={setDate} />

        <Card style={{ gap: space.sm }}>
          <Label>Paid by</Label>
          <MultiSelect
            label="Paid by"
            placeholder="Who paid?"
            options={people.map((pid) => ({ value: pid, label: name(pid) }))}
            values={payers}
            onChange={(next) => {
              // Going from one payer to several: the first starts with the whole amount.
              if (next.length > 1 && payers.length === 1 && amount && !payParts[payers[0]]) setPayParts((x) => ({ ...x, [payers[0]]: centsText(amount) }));
              setPayers(next);
            }}
          />
          {splitPay ? (
            <>
              <Text style={{ color: c.muted, fontSize: 12 }}>Split payment: how much did each pay?</Text>
              {payers.map((pid) => (
                <View key={pid} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
                  <Text style={{ color: c.text, fontWeight: '600', fontSize: 15, flex: 1 }}>{name(pid)}</Text>
                  <TextInput
                    value={payParts[pid] ?? ''}
                    onChangeText={(t) => setPayParts((x) => ({ ...x, [pid]: t }))}
                    placeholder="0.00"
                    placeholderTextColor={c.muted}
                    keyboardType="decimal-pad"
                    accessibilityLabel={`How much ${name(pid)} paid`}
                    style={{ width: 120, textAlign: 'right', borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, fontFamily: fonts.serif, color: c.text, backgroundColor: c.card }}
                  />
                </View>
              ))}
              <Text style={{ fontSize: 12, color: amount && partsSum === amount ? c.primary : c.muted, fontWeight: '700' }}>
                {amount ? (partsSum === amount ? 'Adds up ✓' : `${fmt(partsSum)} of ${fmt(amount)} entered`) : 'Enter the total above first'}
              </Text>
            </>
          ) : null}
        </Card>

        <Card style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label>Split between</Label>
            <Pressable onPress={everyone} hitSlop={8} accessibilityRole="button"><Text style={{ color: c.primary, fontWeight: '700', fontSize: 13 }}>Everyone</Text></Pressable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {people.map((pid) => <Person key={pid} label={name(pid)} on={!!shares[pid]} weight={shares[pid]} onPress={() => tapShare(pid)} onLongPress={() => dropShare(pid)} />)}
          </View>
          <Text style={{ color: c.muted, fontSize: 12, lineHeight: 17 }}>
            Tap again for ×2, ×3 or ×4 when someone brings guests. Press and hold to leave someone out.
          </Text>
          {sharers.length === 1 ? (
            <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>All of it is {name(sharers[0]) === 'Me' ? 'mine' : `${name(sharers[0])}’s`}{amount ? ` (${fmt(amount)})` : ''}</Text>
          ) : amount && sharers.length ? (
            <Text style={{ color: c.text, fontSize: 13 }}>
              <Text style={{ fontWeight: '700' }}>{fmt(one)} per share</Text>
              {multiplied.length ? ` · ${multiplied.map((p) => `${name(p)} ${fmt(perShare[p] ?? one * shares[p])}`).join(' · ')}` : ''}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Text style={{ color: c.muted, fontSize: 12 }}>Just one person?</Text>
            {people.map((pid) => (
              <Pressable key={pid} onPress={() => justOne(pid)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Only ${name(pid)}`}>
                <Text style={{ color: c.primary, fontSize: 12, fontWeight: '700' }}>{name(pid)}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {tried && problem ? <Text style={{ color: c.danger, textAlign: 'center' }}>{problem}</Text> : null}
        <Button title={busy ? 'Saving…' : 'Save Expense'} disabled={busy} onPress={() => void save()} />
        {existing ? <Button title="Delete Expense" kind="ghost" onPress={remove} /> : null}
      </ScrollView>
    </>
  );
}
