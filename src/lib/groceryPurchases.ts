import { MAX_BUYS } from '../shared/grocery.js';
import type { GroceryBuy, GroceryLine, GroceryShare } from '../types.ts';

// The purchase log (brief grocery-purchase-log): a line's own fields are the open purchase, and each time you run out the open purchase is closed into `buys`
// with its own stamp, count, price, store and split. A month counts the closed purchases with the open one. Pure: no store, no screen. Money is whole cents.

const two = (n: number) => String(n).padStart(2, '0');
/** The stamp of a purchase made now: local `YYYY-MM-DDTHH:mm`. */
export const stampNow = (d: Date = new Date()): string => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;

const NO_BUYS: readonly GroceryBuy[] = [];
/** The purchases already closed on a line, oldest first. */
export const buysOf = (l: GroceryLine | undefined): readonly GroceryBuy[] => l?.buys ?? NO_BUYS;

/** What one closed purchase cost: its own prices, else its count times its price; an unpriced one is nothing. */
export const buyCost = (b: GroceryBuy): number => (b.prices ? b.prices.reduce((a, c) => a + c, 0) : b.cents == null ? 0 : Math.round((b.qty ?? 1) * b.cents));
/** What all the closed purchases of a line cost. */
export const closedCost = (l: GroceryLine | undefined): number => buysOf(l).reduce((a, b) => a + buyCost(b), 0);

export interface Frozen { qty: number; cents: number | null; store: string; share: GroceryShare }
/** The line after Ran out: its open purchase moves into `buys` and nothing stays ticked, so the item is back on To get. Null when the line already holds MAX_BUYS closed purchases.
 *  `frozen` is what the open purchase read as at this moment (the item's count and price when the line has none of its own, the store it was bought at, the split it was counted with). */
export function closeOpen(raw: GroceryLine, frozen: Frozen): GroceryLine | null {
  const had = buysOf(raw);
  if (had.length >= MAX_BUYS) return null;
  const b: GroceryBuy = {};
  if (raw.at) b.at = raw.at;
  if (raw.prices?.length) { b.prices = raw.prices; if (raw.packShares) b.packShares = raw.packShares; }
  else { b.qty = frozen.qty; if (frozen.cents != null) b.cents = frozen.cents; else b.unpriced = true; }
  b.share = raw.share ?? frozen.share;
  b.store = frozen.store;
  if (raw.rc) b.rc = true;
  return { buys: [...had, b] };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "3 Nov 14:20" for a stamp with a time, "3 Nov" for a date alone, '' for none; "3 Nov 2025" when it is not this year. */
export function stampText(at: string | undefined, nowYear: number): string {
  if (!at) return '';
  const y = Number(at.slice(0, 4)), mo = Number(at.slice(5, 7)), d = Number(at.slice(8, 10));
  const day = `${d} ${MONTHS[mo - 1]}${y === nowYear ? '' : ` ${y}`}`;
  return at.length > 10 ? `${day} ${at.slice(11)}` : day;
}
