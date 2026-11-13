/**
 * A trip's Expenses tab: Expenses (every bill by day), Balances (who's owed and who owes) and Settle Up (the fewest
 * payments that square everyone, and which have been paid). Everyone in the trip sees the same, live.
 * The app never moves money: people pay each other their own way and mark it here.
 */
import { formatMoney, settleUp, sharesOf, tripBalances, tripTotal, type TripExpense, type TripMoney, type TripPayment } from '@golf/engine';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Body, Button, Card, Label, Segmented } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { useMe } from '@/lib/me';
import { useStore, newId, type EventRecord } from '@/store/store';
import { removeEntry, saveEntry, useLiveLedger, useTripLedger, type LedgerEntry } from '@/sync/trip-ledger';
import { fonts, radius, space, useColors } from '@/theme';

type View_ = 'expenses' | 'balances' | 'settle';
const EMPTY: LedgerEntry[] = [];

/** A little picture for a bill, from its name. */
export function expenseIcon(title: string): string {
  const t = title.toLowerCase();
  if (/golf|green fee|tee time|cart|range|silverrock|club/.test(t)) return '⛳';
  if (/beer|drink|bar|wine|booze|liquor|pub/.test(t)) return '🍺';
  if (/gas|fuel/.test(t)) return '⛽';
  if (/car|uber|lyft|taxi|rental|parking/.test(t)) return '🚗';
  if (/flight|air|plane/.test(t)) return '✈️';
  if (/house|airbnb|vrbo|hotel|condo|rent|clean|lodg/.test(t)) return '🏠';
  if (/grocer|ralph|costco|safeway|store|walmart|target|market/.test(t)) return '🛒';
  if (/breakfast|lunch|dinner|food|restaurant|pizza|mario|cafe|coffee|brunch|wings/.test(t)) return '🍽️';
  if (/merch|hat|shirt|ball/.test(t)) return '🧢';
  return '🧾';
}

/** Short names for a trip's players: first names, with a last initial when two share one ("Dave B.", "Dave M."). */
export function shortNamer(ids: string[], players: { id: string; name: string }[]) {
  const full = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  const firsts = ids.map((id) => full(id).split(' ')[0]);
  return (id: string) => {
    const f = full(id).split(' ')[0];
    if (firsts.filter((x) => x === f).length < 2) return f;
    const last = full(id).split(' ').slice(1).join(' ');
    return last ? `${f} ${last[0]}.` : f;
  };
}

/** Players' names in this trip ("You" for me). */
function useNames(e: EventRecord) {
  const players = useStore((s) => s.players);
  const { isMe } = useMe();
  return useMemo(() => {
    const short = shortNamer(e.playerIds, players);
    return { name: (id: string) => (isMe(id) ? 'You' : short(id)), short, isMe };
  }, [players, e.playerIds, isMe]);
}

export function TripExpenses({ e }: { e: EventRecord }) {
  const c = useColors();
  const money = e.expenses as TripMoney;
  const [view, setView] = useState<View_>('expenses');
  useLiveLedger(e.id, true);
  const entries = useTripLedger((s) => s.byEvent[e.id]) ?? EMPTY;
  const { name, short, isMe } = useNames(e);
  const canEdit = e.remote?.role !== 'viewer';
  const me = e.playerIds.find(isMe);

  const expenses = entries.filter((x): x is LedgerEntry & TripExpense => x.kind === 'expense');
  const payments = entries.filter((x): x is LedgerEntry & TripPayment => x.kind === 'payment');
  const people = [...new Set([...e.playerIds, ...expenses.flatMap((x) => [...Object.keys(x.paidBy), ...Object.keys(x.shares)])])];
  const bal = tripBalances(entries, money, people);
  const total = tripTotal(entries, money);
  const myShare = me ? expenses.reduce((a, x) => a + (sharesOf(x, money)[me] ?? 0), 0) : 0;
  const fmt = (cents: number, o?: { sign?: boolean }) => formatMoney(cents, money.currency, o);
  const alt = (cents: number) => (money.alt ? `≈ ${formatMoney(Math.round(cents * money.alt.rate), money.alt.currency)} ${money.alt.currency}` : '');
  const add = () => router.push({ pathname: '/event/[id]/expense', params: { id: e.id } });

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}>
      <Segmented<View_> options={[{ value: 'expenses', label: 'Expenses' }, { value: 'balances', label: 'Balances' }, { value: 'settle', label: 'Settle Up' }]} value={view} onChange={setView} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 2 }}>
        <View>
          <Label>Trip total</Label>
          <Text style={{ color: c.text, fontFamily: fonts.serif, fontWeight: '700', fontSize: 26 }}>
            {fmt(total)} <Text style={{ color: c.muted, fontSize: 14 }}>{money.currency}</Text>
          </Text>
        </View>
        {me ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Label>Your share</Label>
            <Text style={{ color: c.text, fontFamily: fonts.serif, fontWeight: '700', fontSize: 18, marginTop: 4 }}>{fmt(myShare)}</Text>
          </View>
        ) : null}
      </View>

      {view === 'expenses' ? (
        <>
          {canEdit ? <Button title="+ Add Expense" onPress={add} /> : null}
          {expenses.length === 0 ? (
            <Card><Body muted>No expenses yet. Add the first bill (green fees, groceries, the house) and everyone in the trip sees it.</Body></Card>
          ) : (
            byDay(expenses).map(([day, xs]) => (
              <Card key={day} style={{ paddingVertical: space.sm }}>
                <Label>{formatDate(day, { weekday: 'long', month: 'short', day: 'numeric' })}</Label>
                {xs.map((x, i) => {
                  const payers = Object.keys(x.paidBy);
                  const n = Object.keys(x.shares).length;
                  const guests = Object.values(x.shares).reduce((a, w) => a + w, 0) - n;
                  const split = n === 1 ? `for ${name(Object.keys(x.shares)[0])} only` : guests > 0 ? `${n} people, ${guests} guest${guests === 1 ? '' : 's'}` : `split ${n} ways`;
                  return (
                    <Pressable key={x.id} disabled={!canEdit} onPress={() => router.push({ pathname: '/event/[id]/expense', params: { id: e.id, expense: x.id } })}
                      accessibilityRole="button" accessibilityLabel={`${x.title}, ${formatMoney(x.amount, x.currency)}. Tap to change.`}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.border, opacity: pressed ? 0.6 : 1 })}>
                      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 17 }}>{expenseIcon(x.title)}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>{x.title}</Text>
                        <Text numberOfLines={2} style={{ color: c.muted, fontSize: 12 }}>{payers.map(name).join(' & ')} paid · {split}</Text>
                      </View>
                      <Text style={{ color: c.text, fontFamily: fonts.serif, fontWeight: '700', fontSize: 16 }}>
                        {formatMoney(x.amount, x.currency)}{x.currency !== money.currency ? ` ${x.currency}` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </Card>
            ))
          )}
        </>
      ) : view === 'balances' ? (
        <Balances e={e} bal={bal} people={people} expenses={expenses} payments={payments} money={money} name={name} isMe={isMe} />
      ) : (
        <SettleUp e={e} bal={bal} payments={payments} money={money} name={name} short={short} isMe={isMe} canEdit={canEdit} alt={alt} />
      )}
    </ScrollView>
  );
}

/** Newest day first; within a day, newest first. */
function byDay(xs: (LedgerEntry & TripExpense)[]): [string, (LedgerEntry & TripExpense)[]][] {
  const m = new Map<string, (LedgerEntry & TripExpense)[]>();
  for (const x of [...xs].sort((a, b) => b.date.localeCompare(a.date) || (b.changedAt ?? '').localeCompare(a.changedAt ?? ''))) m.set(x.date, [...(m.get(x.date) ?? []), x]);
  return [...m.entries()];
}

function Balances({ bal, people, expenses, payments, money, name, isMe }: { e: EventRecord; bal: Record<string, number>; people: string[]; expenses: (LedgerEntry & TripExpense)[]; payments: (LedgerEntry & TripPayment)[]; money: TripMoney; name: (id: string) => string; isMe: (id: string) => boolean }) {
  const c = useColors();
  const [cur, setCur] = useState(money.currency);
  const [open, setOpen] = useState<string | null>(null);
  const show = (cents: number, o?: { sign?: boolean }) => (cur === money.currency || !money.alt ? formatMoney(cents, money.currency, o) : formatMoney(Math.round(cents * money.alt.rate), money.alt.currency, o));
  const rows = [...people].sort((a, b) => bal[b] - bal[a]);
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
        <Text style={{ color: c.muted, fontSize: 13, flex: 1 }}>What each person paid, minus their share</Text>
        {money.alt ? (
          <View style={{ width: 120 }}>
            <Segmented compact options={[{ value: money.currency, label: money.currency }, { value: money.alt.currency, label: money.alt.currency }]} value={cur} onChange={setCur} />
          </View>
        ) : null}
      </View>
      <Card style={{ paddingVertical: space.xs }}>
        {rows.map((id, i) => {
          const b = bal[id] ?? 0;
          const paid = expenses.reduce((a, x) => a + (x.paidBy[id] ? Math.round(x.paidBy[id] * (x.currency === money.currency || !money.alt ? 1 : 1 / money.alt.rate)) : 0), 0);
          const share = expenses.reduce((a, x) => a + (sharesOf(x, money)[id] ?? 0), 0);
          const sent = payments.filter((p) => p.from === id).reduce((a, p) => a + p.amount, 0);
          const got = payments.filter((p) => p.to === id).reduce((a, p) => a + p.amount, 0);
          return (
            <Pressable key={id} onPress={() => setOpen(open === id ? null : id)} accessibilityRole="button"
              style={{ paddingVertical: 10, paddingHorizontal: space.md, marginHorizontal: -space.md, borderTopWidth: i ? 1 : 0, borderTopColor: c.border, backgroundColor: isMe(id) ? c.primarySoft : undefined }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, color: c.text, fontWeight: isMe(id) ? '700' : '600', fontSize: 15 }}>{name(id)}</Text>
                <Text style={{ color: c.muted, fontSize: 12 }}>{b > 0 ? (isMe(id) ? 'are owed' : 'is owed') : b < 0 ? (isMe(id) ? 'owe' : 'owes') : 'square'}</Text>
                <Text style={{ width: 104, textAlign: 'right', fontFamily: fonts.serif, fontWeight: '700', fontSize: 16, color: b > 0 ? c.primary : b < 0 ? c.danger : c.muted }}>{show(b, { sign: true })}</Text>
              </View>
              {open === id ? (
                <View style={{ marginTop: 6, gap: 2 }}>
                  <Text style={{ color: c.muted, fontSize: 13 }}>Paid for the group: {show(paid)}</Text>
                  <Text style={{ color: c.muted, fontSize: 13 }}>Share of expenses: {show(share)}</Text>
                  {sent ? <Text style={{ color: c.muted, fontSize: 13 }}>Paid back to others: {show(sent)}</Text> : null}
                  {got ? <Text style={{ color: c.muted, fontSize: 13 }}>Received from others: {show(got)}</Text> : null}
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </Card>
      <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>Tap a name to see how it adds up. Balances always add to zero.</Text>
    </>
  );
}

function Pill({ text, kind }: { text: string; kind: 'paid' | 'confirm' | 'unpaid' }) {
  const c = useColors();
  const bg = kind === 'paid' ? c.primarySoft : kind === 'confirm' ? '#FFF3DC' : c.chip;
  const fg = kind === 'paid' ? c.primary : kind === 'confirm' ? '#8A6416' : c.muted;
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

function SettleUp({ e, bal, payments, money, name, short, isMe, canEdit, alt }: { e: EventRecord; bal: Record<string, number>; payments: (LedgerEntry & TripPayment)[]; money: TripMoney; name: (id: string) => string; short: (id: string) => string; isMe: (id: string) => boolean; canEdit: boolean; alt: (c: number) => string }) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const todo = settleUp(bal);
  const done = payments.filter((p) => p.status === 'received');
  const waiting = payments.filter((p) => p.status === 'sent');
  const totalCount = todo.length + payments.length;
  const fmt = (cents: number) => formatMoney(cents, money.currency);
  const when = (t?: number) => (t ? formatDate(new Date(t).toISOString().slice(0, 10), { month: 'short', day: 'numeric' }) : '');

  const run = async (f: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await f();
    } catch (err) {
      Alert.alert('Couldn’t save that', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };
  const markPaid = (from: string, to: string, amount: number) =>
    run(() => saveEntry(e.id, { id: newId(), kind: 'payment', from, to, amount, status: 'sent', sentAt: Date.now() }));
  const confirm = (p: TripPayment) => run(() => saveEntry(e.id, { ...strip(p), status: 'received', receivedAt: Date.now() }));
  const undo = (p: TripPayment) => run(() => removeEntry(e.id, p.id));

  const askTodo = (t: { from: string; to: string; amount: number }) => {
    if (!canEdit) return;
    Alert.alert(`${short(t.from)} pays ${short(t.to)} ${fmt(t.amount)}`, 'Mark this as paid once the money has been sent (e-Transfer, cash, however you like).', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark as paid', onPress: () => void markPaid(t.from, t.to, t.amount) },
    ]);
  };
  const askPayment = (p: TripPayment) => {
    if (!canEdit) return;
    const title = `${short(p.from)} → ${short(p.to)} ${fmt(p.amount)}`;
    if (p.status === 'sent')
      Alert.alert(title, `${isMe(p.to) ? 'Did you' : `Did ${short(p.to)}`} get this money?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Not received', style: 'destructive', onPress: () => void undo(p) },
        { text: 'Got it', onPress: () => void confirm(p) },
      ]);
    else
      Alert.alert(title, 'This payment was confirmed. Undo it only if it was marked by mistake.', [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Undo payment', style: 'destructive', onPress: () => void undo(p) },
      ]);
  };

  const mineToPay = todo.filter((t) => isMe(t.from));
  const mineToConfirm = waiting.filter((p) => isMe(p.to));
  const others = todo.filter((t) => !isMe(t.from));

  if (!totalCount)
    return <Card><Body muted>Nothing to settle yet. Once expenses are added, this shows who pays whom.</Body></Card>;

  return (
    <>
      <Card style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: c.text, fontFamily: fonts.serif, fontWeight: '700', fontSize: 17 }}>
            {todo.length === 0 && waiting.length === 0 ? 'All square ✓' : `${totalCount} payment${totalCount === 1 ? '' : 's'} settle the trip`}
          </Text>
          <Text style={{ color: c.text, fontWeight: '700', fontSize: 14 }}>{done.length} of {totalCount} done</Text>
        </View>
        <View style={{ height: 8, backgroundColor: c.chip, borderRadius: radius.pill, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round((done.length / totalCount) * 100)}%`, height: '100%', backgroundColor: c.primary }} />
        </View>
      </Card>

      {mineToPay.map((t) => (
        <Card key={`${t.from}-${t.to}`} style={{ borderColor: c.danger, borderWidth: 1.5, gap: space.sm }}>
          <Label style={{ color: c.danger }}>Your payment</Label>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>You pay <Text style={{ fontFamily: fonts.serif, fontWeight: '700' }}>{short(t.to)}</Text></Text>
              {money.alt ? <Text style={{ color: c.muted, fontSize: 12 }}>{alt(t.amount)} at {money.alt.rate}</Text> : null}
            </View>
            <Text style={{ color: c.text, fontFamily: fonts.serif, fontWeight: '700', fontSize: 22 }}>{fmt(t.amount)}</Text>
          </View>
          {canEdit ? <Button title={busy ? 'Saving…' : 'Mark As Paid'} disabled={busy} onPress={() => void markPaid(t.from, t.to, t.amount)} /> : null}
        </Card>
      ))}

      {mineToConfirm.map((p) => (
        <Card key={p.id} style={{ borderColor: c.accent, borderWidth: 1.5, gap: space.sm }}>
          <Label style={{ color: c.accent }}>Did you get it?</Label>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: c.text, fontSize: 16, fontWeight: '600' }}>{short(p.from)} paid you</Text>
            <Text style={{ color: c.text, fontFamily: fonts.serif, fontWeight: '700', fontSize: 22 }}>{fmt(p.amount)}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}><Button title="Got It" disabled={busy} onPress={() => void confirm(p)} /></View>
            <View style={{ flex: 1 }}><Button title="Not Yet" kind="secondary" disabled={busy} onPress={() => void undo(p)} /></View>
          </View>
        </Card>
      ))}

      <Card style={{ paddingVertical: space.xs }}>
        {[
          ...others.map((t) => ({ key: `t-${t.from}-${t.to}`, from: t.from, to: t.to, amount: t.amount, sub: `Waiting on ${name(t.from)}`, pill: <Pill text="Unpaid" kind="unpaid" />, onPress: () => askTodo(t) })),
          ...waiting.filter((p) => !isMe(p.to)).map((p) => ({ key: p.id, from: p.from, to: p.to, amount: p.amount, sub: `${name(p.from)} paid · waiting on ${name(p.to)}`, pill: <Pill text="Confirm?" kind="confirm" />, onPress: () => askPayment(p) })),
          ...[...done].sort((a, b) => (b.receivedAt ?? 0) - (a.receivedAt ?? 0)).map((p) => ({ key: p.id, from: p.from, to: p.to, amount: p.amount, sub: `Received ${when(p.receivedAt)}`, pill: <Pill text="✓ Paid" kind="paid" />, onPress: () => askPayment(p) })),
        ].map((row, i) => (
          <Pressable key={row.key} onPress={row.onPress} disabled={!canEdit} accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.border, opacity: pressed ? 0.6 : 1 })}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>{name(row.from)} → {name(row.to)}</Text>
              <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{row.sub}</Text>
            </View>
            <Text style={{ color: c.text, fontFamily: fonts.serif, fontWeight: '700', fontSize: 15 }}>{fmt(row.amount)}</Text>
            {row.pill}
          </Pressable>
        ))}
      </Card>
      <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>Pay however you like (e-Transfer, cash). The person paid taps ✓ to confirm. Tap any payment to mark it.</Text>
    </>
  );
}

const strip = (p: LedgerEntry & TripPayment): TripPayment => ({ id: p.id, kind: 'payment', from: p.from, to: p.to, amount: p.amount, status: p.status, sentAt: p.sentAt, receivedAt: p.receivedAt });
