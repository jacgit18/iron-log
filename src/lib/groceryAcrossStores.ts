import { everyone, payerOf, purchasesOf, storeSettlement, storeStatus, storesBought } from './grocerySettle.js';
import { ME } from './grocerySplit.js';
import type { Grocery, GroceryMonth } from '../types.ts';

/* ---------- One amount per person over every store of a month ----------
   The store cards say who pays whom per store (the payer and the receipt's tax are per store). This adds each person's rows up over the stores:
   what they still owe you at the stores you paid, less what you still owe them at the stores they paid. Rows between two other people are
   not yours and stay out, as in monthOwes. Rows marked settled stay out. Pure: no store, no screen. Money is whole cents. */

export interface AcrossPerson {
  id: string;
  name: string;
  /** Positive: they owe you. Negative: you owe them. Zero: even. */
  cents: number;
  /** The stores behind the number, in the list's order, each with its own signed amount. */
  parts: { store: string; cents: number }[];
}
export interface Across { people: AcrossPerson[]; net: number }

/** The netted amounts per person, or null when there is nothing to net: the block only helps once more than one store was bought from and a group exists. */
export function acrossStores(g: Grocery, m: GroceryMonth): Across | null {
  if (!g.groups?.length) return null;
  const purchases = purchasesOf(g, m);
  const stores = storesBought(g, purchases);
  if (stores.length < 2) return null;
  const names = new Map(everyone(g).map(p => [p.id, p.n]));
  const byPerson = new Map<string, AcrossPerson>();
  stores.forEach(store => {
    storeStatus(g, m, store, purchases).rows.forEach(r => {
      if (r.paid || r.kind === 'owesPayer') return; // settled, or between two other people
      const cents = r.kind === 'youOwe' ? -r.cents : r.cents;
      const p = byPerson.get(r.id) ?? { id: r.id, name: names.get(r.id) ?? 'Someone', cents: 0, parts: [] };
      p.cents += cents; p.parts.push({ store, cents }); byPerson.set(r.id, p);
    });
  });
  const order = new Map(everyone(g).map((p, i) => [p.id, i])); // the groups' own order, people who are gone included
  const people = [...byPerson.values()].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return people.length ? { people, net: people.reduce((a, p) => a + p.cents, 0) } : null;
}

/* ---------- Everyone's month over every store ----------
   Paid: the bills of the stores a person paid. Share: what their items and the receipt's tax come to, over every store. Neither moves with Mark paid
   (a mark only says the money changed hands). The All row adds up to the bills: paid and share totals are equal. */

export interface PersonMonth { id: string; name: string; paid: number; share: number }
export interface AcrossTotals { people: PersonMonth[]; paid: number; share: number }

/** Each person's Paid and Share over the month's stores, you first, then the groups' order (people who are gone keep a row when they have money in this month); null on the same gate as `acrossStores` (a group and 2 or more stores) and when only one person has money in the month. */
export function acrossPeople(g: Grocery, m: GroceryMonth): AcrossTotals | null {
  if (!g.groups?.length) return null;
  const purchases = purchasesOf(g, m);
  const stores = storesBought(g, purchases);
  if (stores.length < 2) return null;
  const by = new Map<string, PersonMonth>();
  const names = new Map(everyone(g).map(p => [p.id, p.n]));
  const row = (id: string) => { let p = by.get(id); if (!p) { p = { id, name: id === ME ? 'You' : names.get(id) ?? 'Someone', paid: 0, share: 0 }; by.set(id, p); } return p; };
  stores.forEach(store => {
    const st = storeSettlement(g, m, store, purchases); const payer = payerOf(g, m, store);
    row(payer).paid += st.bill;
    row(ME).share += st.yourShare;
    let others = 0;
    st.rows.forEach(r => { if (r.kind === 'youOwe') return; row(r.id).share += r.cents; others += r.cents; }); // the payer's own share is not a row: it is what is left of the bill
    if (payer !== ME) row(payer).share += st.bill - st.yourShare - others;
  });
  const order = new Map([[ME, -1], ...everyone(g).map((p, i): [string, number] => [p.id, i])]);
  const people = [...by.values()].filter(p => p.paid > 0 || p.share > 0).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  if (people.length < 2) return null; // only you have money in it: nothing to compare
  return { people, paid: people.reduce((a, p) => a + p.paid, 0), share: people.reduce((a, p) => a + p.share, 0) };
}
