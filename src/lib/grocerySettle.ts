import { lineCost, lineOf, own, shiftMonth, storeFor } from './grocery.js';
import { ME, partiesOf, settle, type Purchase, type Settlement } from './grocerySplit.js';
import type { Grocery, GroceryGroup, GroceryItem, GroceryLine, GroceryMonth, GroceryPerson } from '../types.ts';

/* ---------- A month of groceries, split ----------
   Turns what was bought in a month (ticked lines, packs priced one by one) into purchases with their parties, then into totals and a
   settle-up per store. Pure: no store, no screen. Money is whole cents (grocerySplit.ts). */

/** The ids of everyone in any group, so a person who was removed is told apart from one who exists. */
export const knownPeople = (g: Grocery): Set<string> => new Set((g.groups ?? []).flatMap(x => x.people.map(p => p.id)));

/** Everyone in any group, once each, in the order the groups list them. */
export const allPeople = (g: Grocery): GroceryPerson[] => {
  const seen = new Set<string>();
  return (g.groups ?? []).flatMap(x => x.people).filter(p => !seen.has(p.id) && !!seen.add(p.id));
};

/** The group a store defaults to, if any. */
export const groupOfStore = (g: Grocery, store: string): GroceryGroup | undefined => g.groups?.find(x => x.stores.includes(store));

/** Who paid for a store: the person recorded, or you when none is recorded or that person no longer exists. */
export function payerOf(g: Grocery, m: GroceryMonth, store: string): string {
  const id = own(m.payer, store);
  return id && knownPeople(g).has(id) ? id : ME;
}

/** Who shares an item this month, most specific first: the pack's own share, the line's, the item's, the store's group, else just you. */
export function partiesFor(g: Grocery, item: GroceryItem, line?: GroceryLine, pack?: number): string[] {
  const own = (pack !== undefined ? line?.packShares?.[pack] : undefined) ?? line?.share ?? item.share;
  return partiesOf(own, groupOfStore(g, item.store), knownPeople(g));
}

/** A short label for a split: Just me, Me +2, or Not mine. */
export const shareText = (parties: readonly string[]): string =>
  !parties.includes(ME) ? 'Not mine' : parties.length === 1 ? 'Just me' : `Me +${parties.length - 1}`;

export interface MonthPurchase extends Purchase { store: string; itemId: string }

/** Every bought line of a month as purchases: a line priced pack by pack is one purchase per pack (each with its own share, else the line's,
 *  else the item's, else the store's group); any other line is one purchase for its whole cost. A line for an item that was removed counts
 *  as yours alone, as spending does. */
export function purchasesOf(g: Grocery, m: GroceryMonth): MonthPurchase[] {
  const out: MonthPurchase[] = [];
  Object.entries(m.lines).forEach(([id, raw]) => {
    if (!raw.got) return;
    const found = g.items.find(x => x.id === id);
    const store = found ? storeFor(g, found, m) : ''; // where it was bought this month
    const it = found && store !== found.store ? { ...found, store } : found; // the store's group is the default split for it
    if (!it) { // removed from the catalogue: only its own price and count remain
      const cents = raw.prices?.length ? raw.prices.reduce((a, c) => a + c, 0) : Math.round((raw.qty ?? 1) * (raw.cents ?? 0));
      out.push({ store, itemId: id, cents, parties: [ME] });
      return;
    }
    const l = lineOf(it, m);
    if (l.prices) l.prices.forEach((cents, i) => out.push({ store, itemId: id, cents, parties: partiesFor(g, it, raw, i) }));
    else out.push({ store, itemId: id, cents: lineCost(l), parties: partiesFor(g, it, raw) });
  });
  return out;
}

/** Whether the list has any sharing set up, so the screens that show it can stay as they were for everyone else. */
export const hasSharing = (g: Grocery): boolean => (g.groups?.length ?? 0) > 0;

/** The stores that have something bought this month, in the list's order, with the no-store group last (`''`). */
export function storesBought(g: Grocery, purchases: readonly MonthPurchase[]): string[] {
  const seen = new Set(purchases.map(p => p.store));
  return [...g.stores.filter(s => seen.has(s)), ...(seen.has('') ? [''] : [])];
}

/** Who pays whom for one store this month. */
export function storeSettlement(g: Grocery, m: GroceryMonth, store: string, purchases: readonly MonthPurchase[] = purchasesOf(g, m)): Settlement {
  const covered = new Set((g.groups ?? []).flatMap(x => x.people.filter(p => p.covered).map(p => p.id)));
  const mine = purchases.filter(p => p.store === store);
  return settle(mine, payerOf(g, m, store), covered, mine.length ? own(m.tax, store) ?? 0 : 0); // the receipt's tax, typed in; only for a store with something bought
}

/** What you paid this month (the bills of the stores where you are the payer; a store someone else paid is not yours to have paid) and your share
 *  of everything bought: the number that belongs in your own spending. */
export function monthShare(g: Grocery, m: GroceryMonth): { paid: number; yours: number } {
  let paid = 0, yours = 0;
  new Set(purchasesOf(g, m).map(p => p.store)).forEach(store => { const s = storeSettlement(g, m, store); if (payerOf(g, m, store) === ME) paid += s.bill; yours += s.yourShare; });
  return { paid, yours };
}

/** What changes hands this month, over every store bought from: `owed` is what others owe you (the stores you paid for), `youOwe` is what you
 *  owe others (the stores someone else paid). */
export function monthOwes(g: Grocery, m: GroceryMonth): { owed: number; youOwe: number } {
  const purchases = purchasesOf(g, m);
  let owed = 0, youOwe = 0;
  storesBought(g, purchases).forEach(store => { const st = storeSettlement(g, m, store, purchases); owed += st.owedToYou; youOwe += st.youOwe; });
  return { owed, youOwe };
}

/** What others owe you this month (the "Owed to you" figure on the split card). */
export const monthOwed = (g: Grocery, m: GroceryMonth): number => monthOwes(g, m).owed;

/** What was paid and your share for each of the `count` months ending at `endKey` (oldest first), for the Spending view. */
export function shareByMonth(g: Grocery, months: Record<string, GroceryMonth>, endKey: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const key = shiftMonth(endKey, i - count + 1); const m = months[key];
    const { paid, yours } = m ? monthShare(g, m) : { paid: 0, yours: 0 };
    return { key, paid, yours };
  });
}
