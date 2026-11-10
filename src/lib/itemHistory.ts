import type { GroceryItem, GroceryMonth } from '../types.ts';
import { lineOf, money, unitWords } from './grocery.js';
import { buysOf } from './groceryPurchases.js';

// Price and place history of one At home item (brief grocery-price-history): every saved month where it was ticked bought, newest first, with what it cost each and where.
// Pure; reads the months the store already holds. A line with no price of its own uses the item's usual price, as To get and Spend do.
export interface Purchase { month: string; at?: string; store: string; qty: number; cents: number | null; prices?: number[]; each: number | null }
export interface ItemHistory { purchases: Purchase[]; cheapestEach: number | null; averageEach: number | null; topStore: string; priced: number }

const eachOf = (cents: number | null, prices?: number[]) => (prices ? Math.round(prices.reduce((a, c) => a + c, 0) / prices.length) : cents);

export function itemHistory(item: GroceryItem, months: Readonly<Record<string, GroceryMonth>>): ItemHistory {
  const purchases: Purchase[] = Object.keys(months).sort().reverse().flatMap(month => {
    const m = months[month]!; const raw = m.lines[item.id];
    const open: Purchase[] = raw?.got === true ? (() => { const l = lineOf(item, m); return [{ month, ...(raw.at ? { at: raw.at } : {}), store: raw.store ?? item.store, qty: l.qty, cents: l.cents, ...(l.prices ? { prices: l.prices } : {}), each: eachOf(l.cents, l.prices) }]; })() : [];
    const closed: Purchase[] = buysOf(raw).map(b => ({ month, ...(b.at ? { at: b.at } : {}), store: b.store ?? item.store, qty: b.prices ? b.prices.length : b.qty ?? 1, cents: b.cents ?? null, ...(b.prices ? { prices: b.prices } : {}), each: eachOf(b.cents ?? null, b.prices) }));
    return [...open, ...closed.reverse()]; // the open one is the latest; closed ones follow, newest first
  });
  const prices = purchases.flatMap(p => (p.each == null ? [] : [p.each]));
  const counts = new Map<string, number>();
  for (const p of purchases) counts.set(p.store, (counts.get(p.store) ?? 0) + 1);
  let topStore = '', top = 0;
  for (const p of purchases) { const n = counts.get(p.store)!; if (n > top) { top = n; topStore = p.store; } } // newest first, so a tie goes to the most recent store
  return {
    purchases,
    cheapestEach: prices.length ? Math.min(...prices) : null,
    averageEach: prices.length ? Math.round(prices.reduce((a, c) => a + c, 0) / prices.length) : null,
    topStore,
    priced: prices.length,
  };
}

/** "Oct", or "Oct 2025" when the month is not in the current year. */
export const shortMonth = (key: string, nowKey: string) => {
  const d = new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1);
  return d.toLocaleDateString(undefined, key.slice(0, 4) === nowKey.slice(0, 4) ? { month: 'short' } : { month: 'short', year: 'numeric' });
};

/** The line under an At home row: "Last: $3.49 at Aldi, Oct". Empty for an item never bought. */
export function lastBoughtText(item: GroceryItem, h: ItemHistory, nowKey: string): string {
  const p = h.purchases[0];
  if (!p) return '';
  return `Last: ${p.each == null ? 'no price' : money(p.each) + unitWords(item.unit).per} at ${p.store || 'Anywhere'}, ${shortMonth(p.month, nowKey)}`;
}
