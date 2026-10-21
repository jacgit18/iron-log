import { lineCost, lineOf, removedBought } from './grocery.js';
import type { Grocery, GroceryMonth } from '../types.ts';

/** What was bought this month of items that have since been removed from the list, per store (where it was bought; the line keeps its own price and count): the
 *  purchase stays in the month's spending and split, so a store's tally and its tax box must still count it (audit X-8). Built on `removedBought`, the same
 *  purchases the Spent tile, the store lines and Spending read. Pure: no store, no screen. */
export function removedBoughtByStore(g: Grocery, m: GroceryMonth): Record<string, { count: number; cents: number }> {
  const out: Record<string, { count: number; cents: number }> = {};
  removedBought(g, m).forEach(it => {
    const at = out[it.store] ?? (out[it.store] = { count: 0, cents: 0 });
    at.count++; at.cents += lineCost(lineOf(it, m));
  });
  return out;
}
