/**
 * Trip expenses: who paid what, who shares it, what everyone's balance is, and the fewest payments that settle
 * the trip. All amounts are whole cents in the trip's currency, so everything always adds up to exactly zero.
 */

/** One shared bill. */
export interface TripExpense {
  id: string;
  kind: 'expense';
  title: string;
  /** Total, in cents, in `currency`. */
  amount: number;
  /** The trip's currency, or its second currency (converted at the trip's rate). */
  currency: string;
  /** YYYY-MM-DD */
  date: string;
  /** Who paid, and how much each (cents, in `currency`). Adds up to `amount`. */
  paidBy: Record<string, number>;
  /** Who shares it: player id → shares (1 normally, 2 when they bring a guest). */
  shares: Record<string, number>;
}

/** Money one person sent another to settle up. */
export interface TripPayment {
  id: string;
  kind: 'payment';
  from: string;
  to: string;
  /** Cents, in the trip's currency. */
  amount: number;
  /** sent: the payer says it's paid. received: the person paid confirmed it. */
  status: 'sent' | 'received';
  sentAt: number;
  receivedAt?: number;
}

export type TripEntry = TripExpense | TripPayment;

/** A trip's expense settings (on the event). */
export interface TripMoney {
  on: boolean;
  /** e.g. 'USD' */
  currency: string;
  /** A second currency to show amounts in, and how many of it one of the trip's currency buys (USD → CAD 1.33). */
  alt?: { currency: string; rate: number };
}

export const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'MXN', 'AUD'] as const;

/** A small stable number for a string (so ties go a different way on each expense, not always to the same person). */
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** Split `total` cents by weights, exactly (the odd cents go to the largest remainders; ties vary with `seed`). */
export function splitCents(total: number, weights: Record<string, number>, seed = ''): Record<string, number> {
  const ids = Object.keys(weights).filter((id) => weights[id] > 0);
  const sum = ids.reduce((a, id) => a + weights[id], 0);
  const out: Record<string, number> = {};
  if (!ids.length || !sum) return out;
  const raw = ids.map((id) => ({ id, exact: (total * weights[id]) / sum }));
  let used = 0;
  for (const r of raw) {
    out[r.id] = Math.floor(r.exact);
    used += out[r.id];
  }
  const left = total - used;
  [...raw].sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)) || hash(seed + a.id) - hash(seed + b.id))
    .slice(0, left)
    .forEach((r) => { out[r.id] += 1; });
  return out;
}

/** An expense's amount (or a part of it) in the trip's currency. */
export function toTrip(cents: number, currency: string, money: TripMoney): number {
  return currency === money.currency || !money.alt || currency !== money.alt.currency ? cents : Math.round(cents / money.alt.rate);
}

/** In the trip's currency: what each person paid and what their share came to. */
function expenseInTrip(x: TripExpense, money: TripMoney) {
  const total = toTrip(x.amount, x.currency, money);
  const paidRaw = Object.fromEntries(Object.entries(x.paidBy).map(([id, c]) => [id, toTrip(c, x.currency, money)]));
  // Rounding a conversion can leave a cent over or under: the first payer absorbs it.
  const diff = total - Object.values(paidRaw).reduce((a, b) => a + b, 0);
  const first = Object.keys(paidRaw)[0];
  if (first && diff) paidRaw[first] += diff;
  return { total, paid: paidRaw, owes: splitCents(total, x.shares, x.id) };
}

/** Each person's share of one expense (cents, trip currency). */
export const sharesOf = (x: TripExpense, money: TripMoney) => expenseInTrip(x, money).owes;

/**
 * Everyone's balance in cents (trip currency): what they paid minus their share, plus payments they sent, minus
 * payments they received. Positive = is owed money. Always sums to zero.
 */
export function tripBalances(entries: TripEntry[], money: TripMoney, people: string[] = []): Record<string, number> {
  const bal: Record<string, number> = Object.fromEntries(people.map((p) => [p, 0]));
  const add = (id: string, c: number) => { bal[id] = (bal[id] ?? 0) + c; };
  for (const e of entries) {
    if (e.kind === 'expense') {
      const { paid, owes } = expenseInTrip(e, money);
      for (const [id, c] of Object.entries(paid)) add(id, c);
      for (const [id, c] of Object.entries(owes)) add(id, -c);
    } else {
      add(e.from, e.amount);
      add(e.to, -e.amount);
    }
  }
  return bal;
}

export interface Transfer { from: string; to: string; amount: number }

/** The payments that settle these balances: whoever owes most pays whoever is owed most, until everyone is square. */
export function settleUp(bal: Record<string, number>): Transfer[] {
  const owe = Object.entries(bal).filter(([, c]) => c < 0).map(([id, c]) => ({ id, c: -c })).sort((a, b) => b.c - a.c || a.id.localeCompare(b.id));
  const owed = Object.entries(bal).filter(([, c]) => c > 0).map(([id, c]) => ({ id, c })).sort((a, b) => b.c - a.c || a.id.localeCompare(b.id));
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < owe.length && j < owed.length) {
    const x = Math.min(owe[i].c, owed[j].c);
    if (x > 0) out.push({ from: owe[i].id, to: owed[j].id, amount: x });
    owe[i].c -= x;
    owed[j].c -= x;
    if (owe[i].c === 0) i++;
    if (owed[j].c === 0) j++;
  }
  return out;
}

/** The trip total in its currency (cents). */
export const tripTotal = (entries: TripEntry[], money: TripMoney) =>
  entries.reduce((a, e) => a + (e.kind === 'expense' ? toTrip(e.amount, e.currency, money) : 0), 0);

/** "$1,496.00" */
export function formatMoney(cents: number, currency = 'USD', opts: { sign?: boolean } = {}): string {
  const sym = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
  const abs = Math.abs(cents);
  const s = `${sym}${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `−${s}` : opts.sign && cents > 0 ? `+${s}` : s;
}

/** "12.50" or "$12.50" typed → 1250 cents (null if it isn't an amount). */
export function parseCents(text: string): number | null {
  const t = text.replace(/[$,\s€£]/g, '');
  if (!/^\d*(\.\d{0,2})?$/.test(t) || !t || t === '.') return null;
  const [d, f = ''] = t.split('.');
  return Number(d || '0') * 100 + Number((f + '00').slice(0, 2));
}

/** Cents → "1496.00" for an input box. */
export const centsText = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
