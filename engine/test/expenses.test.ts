import { describe, expect, it } from 'vitest';
import { tripBalances, settleUp, splitCents, tripTotal, parseCents, formatMoney, type TripEntry, type TripMoney } from '../src/expenses';
const M: TripMoney = { on: true, currency: 'USD', alt: { currency: 'CAD', rate: 1.33 } };
const P = ['Jim','Dale','Brent','Bill','Ernst','DaveB','Rich','Dan','DaveM'];
const all = (extra: Record<string, number> = {}, without: string[] = []) => ({ ...Object.fromEntries(P.filter((p) => !without.includes(p)).map((p) => [p, 1])), ...extra });
const only = (...ids: string[]) => Object.fromEntries(ids.map((i) => [i, 1]));
let n = 0;
const x = (amount: number, paidBy: Record<string, number>, shares: Record<string, number>): TripEntry => ({ id: String(n++), kind: 'expense', title: 't', amount: Math.round(amount * 100), currency: 'USD', date: '2018-03-15', paidBy: Object.fromEntries(Object.entries(paidBy).map(([k, v]) => [k, Math.round(v * 100)])), shares });
const trip = [
  x(1340, { Jim: 1340 }, all({ Jim: 2 })), x(720, { Jim: 720 }, only('Brent','Bill','Ernst','DaveB','Rich','DaveM')),
  x(350, { Jim: 350 }, all()), x(200, { Jim: 200 }, all()), x(237, { Jim: 237 }, all()),
  x(80, { Jim: 80 }, only('Jim','Brent','Bill','Ernst','DaveB','Rich','DaveM')), x(272.14, { Ernst: 272.14 }, all({}, ['Jim'])),
  x(1496, { DaveB: 548, Rich: 948 }, all({ Jim: 2, Dan: 2 })), x(32, { Jim: 32 }, only('Bill')), x(630, { Dan: 630 }, all()),
  x(82, { Rich: 82 }, all()), x(72, { Bill: 72 }, only('Jim','Brent','Bill','Ernst','DaveB','Rich','DaveM')),
  x(13, { Bill: 13 }, all({}, ['Dan'])), x(99.15, { Bill: 99.15 }, all({}, ['Jim'])),
];
describe('trip expenses', () => {
  it('matches the 2018 sheet', () => {
    const b = tripBalances(trip, M, P);
    expect(Object.values(b).reduce((a, c) => a + c, 0)).toBe(0);
    for (const [k, v] of [['Jim', 222911], ['Rich', 40369], ['Brent', -62631], ['Dan', 1103]] as const) expect(Math.abs(b[k] - v)).toBeLessThanOrEqual(3);
    expect(tripTotal(trip, M)).toBe(562329);
    const t = settleUp(b);
    expect(t.length).toBe(8);
    const after = tripBalances([...trip, ...t.map((p, i) => ({ id: 'p' + i, kind: 'payment' as const, ...p, status: 'sent' as const, sentAt: 0 }))], M, P);
    expect(Object.values(after).every((c) => c === 0)).toBe(true);
    expect(settleUp(after)).toEqual([]);
  });
  it('splits cents exactly', () => {
    expect(Object.values(splitCents(1000, { a: 1, b: 1, c: 1 })).reduce((a, c) => a + c, 0)).toBe(1000);
    expect(splitCents(149600, { a: 2, b: 1 })).toEqual({ a: 99733, b: 49867 });
  });
  it('converts the second currency', () => {
    const e: TripEntry = { id: 'z', kind: 'expense', title: 'x', amount: 13300, currency: 'CAD', date: '2018-01-01', paidBy: { a: 13300 }, shares: { a: 1, b: 1 } };
    expect(tripBalances([e], M)).toEqual({ a: 5000, b: -5000 });
  });
  it('parses and formats', () => {
    expect(parseCents('$1,496')).toBe(149600); expect(parseCents('12.5')).toBe(1250); expect(parseCents('abc')).toBeNull();
    expect(formatMoney(-62631)).toBe('−$626.31'); expect(formatMoney(222911, 'USD', { sign: true })).toBe('+$2,229.11');
  });
});
