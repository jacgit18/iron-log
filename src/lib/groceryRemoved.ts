import { lineCost, lineOf, removedItem, storeFor } from './grocery.js';
import type { Grocery, GroceryMonth } from '../types.ts';

/** What was bought this month of items that have since been removed from the list, per store (where it was bought; the line keeps its own price and count): the
 *  purchase stays in the month's spending and split, so a store's tally and its tax box must still count it (audit X-8). Pure: no store, no screen. */
export function removedBoughtByStore(g: Grocery, m: GroceryMonth): Record<string, { count: number; cents: number }> {
  const out: Record<string, { count: number; cents: number }> = {};
  Object.entries(m.lines).forEach(([id, raw]) => {
    if (!raw.got || g.items.some(x => x.id === id)) return;
    const it = removedItem(g, id, raw);
    const store = storeFor(g, it, m); const l = lineOf(it, m);
    const at = out[store] ?? (out[store] = { count: 0, cents: 0 });
    at.count++; at.cents += lineCost(l);
  });
  return out;
}
