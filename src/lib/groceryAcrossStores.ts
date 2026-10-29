import { allPeople, everyone, purchasesOf, storeStatus, storesBought } from './grocerySettle.js';
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
  const order = new Map(allPeople(g).concat(everyone(g)).map((p, i) => [p.id, i]));
  const people = [...byPerson.values()].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return people.length ? { people, net: people.reduce((a, p) => a + p.cents, 0) } : null;
}
