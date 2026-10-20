import { lineCost, lineOf } from './grocery.js';
import { ME, partiesOf, settle, type Purchase, type Settlement } from './grocerySplit.js';
import type { Grocery, GroceryGroup, GroceryMonth } from '../types.ts';

/* ---------- A month of groceries, split ----------
   Turns what was bought in a month (ticked lines, packs priced one by one) into purchases with their parties, then into totals and a
   settle-up per store. Pure: no store, no screen. Money is whole cents (grocerySplit.ts). */

/** The ids of everyone in any group, so a person who was removed is told apart from one who exists. */
export const knownPeople = (g: Grocery): Set<string> => new Set((g.groups ?? []).flatMap(x => x.people.map(p => p.id)));

/** The group a store defaults to, if any. */
export const groupOfStore = (g: Grocery, store: string): GroceryGroup | undefined => g.groups?.find(x => x.stores.includes(store));

/** Who paid for a store: the person recorded, or you when none is recorded or that person no longer exists. */
export function payerOf(g: Grocery, m: GroceryMonth, store: string): string {
  const id = m.payer?.[store];
  return id && knownPeople(g).has(id) ? id : ME;
}

export interface MonthPurchase extends Purchase { store: string; itemId: string }

/** Every bought line of a month as purchases: a line priced pack by pack is one purchase per pack (each with its own share, else the line's,
 *  else the item's, else the store's group); any other line is one purchase for its whole cost. A line for an item that was removed counts
 *  as yours alone, as spending does. */
export function purchasesOf(g: Grocery, m: GroceryMonth): MonthPurchase[] {
  const known = knownPeople(g); const out: MonthPurchase[] = [];
  Object.entries(m.lines).forEach(([id, raw]) => {
    if (!raw.got) return;
    const it = g.items.find(x => x.id === id);
    const store = it?.store ?? '';
    if (!it) { // removed from the catalogue: only its own price and count remain
      const cents = raw.prices?.length ? raw.prices.reduce((a, c) => a + c, 0) : Math.round((raw.qty ?? 1) * (raw.cents ?? 0));
      out.push({ store, itemId: id, cents, parties: [ME] });
      return;
    }
    const l = lineOf(it, m); const group = groupOfStore(g, store); const usual = raw.share ?? it.share;
    if (l.prices) l.prices.forEach((cents, i) => out.push({ store, itemId: id, cents, parties: partiesOf(raw.packShares?.[i] ?? usual, group, known) }));
    else out.push({ store, itemId: id, cents: lineCost(l), parties: partiesOf(usual, group, known) });
  });
  return out;
}

/** The stores that have something bought this month, in the list's order, with the no-store group last (`''`). */
export function storesBought(g: Grocery, purchases: readonly MonthPurchase[]): string[] {
  const seen = new Set(purchases.map(p => p.store));
  return [...g.stores.filter(s => seen.has(s)), ...(seen.has('') ? [''] : [])];
}

/** Who pays whom for one store this month. */
export function storeSettlement(g: Grocery, m: GroceryMonth, store: string, purchases: readonly MonthPurchase[] = purchasesOf(g, m)): Settlement {
  const covered = new Set((g.groups ?? []).flatMap(x => x.people.filter(p => p.covered).map(p => p.id)));
  return settle(purchases.filter(p => p.store === store), payerOf(g, m, store), covered);
}

/** What the month cost in all (what was paid) and your share of it: the number that belongs in your own spending. */
export function monthShare(g: Grocery, m: GroceryMonth): { paid: number; yours: number } {
  let paid = 0, yours = 0;
  new Set(purchasesOf(g, m).map(p => p.store)).forEach(store => { const s = storeSettlement(g, m, store); paid += s.bill; yours += s.yourShare; });
  return { paid, yours };
}
