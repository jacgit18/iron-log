import type { Grocery, GroceryItem, GroceryLine, GroceryMonth, GroceryPerson, GroceryShare } from '../types.ts';
import { money } from './grocery.js';
import { knownPeople, partiesFor, payerOf } from './grocerySettle.js';
import { ME, partiesOf, totalsOf } from './grocerySplit.js';

/* ---------- Receipt share (brief receipt-share): who shares what a receipt buys. The receipt sheet holds one choice for the whole receipt and, for any row, an own choice that
   beats it. A choice of null is "use the usual": the item's own split, else the store's group, as Shopping shows it. Apply writes only the shares that were chosen, into that
   month's line (never the item's usual split). Pure: no store, no screen. ---------- */

/** `whole`: the split for every row without its own (null: each row keeps its usual). `rows`: a row's own split by row key; a row that is not here follows `whole`. */
export interface ShareChoices { whole: GroceryShare | null; rows: Readonly<Record<string, GroceryShare>> }
export const NO_CHOICES: ShareChoices = { whole: null, rows: {} };

export const setWhole = (c: ShareChoices, share: GroceryShare | null): ShareChoices => ({ ...c, whole: share });
/** A row's own split; null removes it, so the row follows the whole receipt again. */
export function setRow(c: ShareChoices, key: string, share: GroceryShare | null): ShareChoices {
  const rows = { ...c.rows };
  if (share) rows[key] = share; else delete rows[key];
  return { ...c, rows };
}
export const isOwnRow = (c: ShareChoices, key: string): boolean => key in c.rows;
export const wholeIsSet = (c: ShareChoices): boolean => c.whole !== null;
/** The split chosen for a row: its own, else the whole receipt's, else null (the usual). */
export const shareForRow = (c: ShareChoices, key: string): GroceryShare | null => c.rows[key] ?? c.whole;

/** Who shares a row: the chosen split (people who no longer exist drop out), else what Shopping would show for the item (its split or the store's group), else you alone. */
export function rowParties(g: Grocery, item: GroceryItem | undefined, line: GroceryLine | undefined, share: GroceryShare | null): string[] {
  if (share) return partiesOf(share, undefined, knownPeople(g));
  return item ? partiesFor(g, item, line) : [ME];
}

/** One ticked row of the sheet: its key, the item it goes to and what it cost after any discount. */
export interface ShareRow { key: string; itemId: string | null; include: boolean; cents: number }

/** The shares Apply writes: one per applied item, from the first ticked row that names it, only where a split was chosen (the usual is not written). */
export interface ShareWrite { id: string; share: GroceryShare }
export function shareWrites(c: ShareChoices, rows: readonly ShareRow[], ids: ReadonlyMap<string, string> = new Map()): ShareWrite[] {
  const out: ShareWrite[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.include || !r.itemId) continue;
    const id = ids.get(r.itemId) ?? r.itemId; // an item added on the sheet has its real id once it is made
    if (seen.has(id)) continue;
    seen.add(id);
    const share = shareForRow(c, r.key);
    if (share) out.push({ id, share });
  }
  return out;
}

/** What the shown picker says for the whole receipt: the whole split when one is chosen, else the first ticked row's usual (the picker needs people to tick). */
export function wholeParties(g: Grocery, c: ShareChoices, usual: readonly (string[] | undefined)[]): string[] {
  if (c.whole) return partiesOf(c.whole, undefined, knownPeople(g));
  return usual.find((p): p is string[] => !!p) ?? [ME];
}

/** The live line over the sheet: what each person owes you and your share of the ticked rows. If someone else paid for the store, only your share is said (the settle-up on Who owes who
 *  says the rest). Tax is left out here: the store's settle-up adds it as it does for any purchase. Empty when no row is ticked. */
export function owedText(g: Grocery, month: GroceryMonth | undefined, store: string | null, rows: readonly { cents: number; parties: readonly string[] }[], people: readonly GroceryPerson[]): string {
  if (!rows.length) return '';
  const totals = totalsOf(rows.map(r => ({ cents: r.cents, parties: r.parties })));
  const mine = totals[ME] ?? 0;
  const paidByMe = !month || !store || payerOf(g, month, store) === ME;
  const names = new Map(people.map(p => [p.id, p.n] as const));
  const others = Object.entries(totals).filter(([id, c]) => id !== ME && c > 0);
  if (!others.length) return mine > 0 ? `All yours: ${money(mine)}` : 'Nothing is yours';
  if (!paidByMe) return `Your share ${money(mine)}`;
  return `${others.map(([id, c]) => `${names.get(id) ?? 'Someone'} owes you ${money(c)}`).join(' · ')} · your share ${money(mine)}`;
}

/** The store action Apply uses to write one line's share (a month line only; it never changes the item's usual split). */
export interface ShareApi { setGroceryReceiptShare(month: string, id: string, share: GroceryShare | null): void }
export function applyShares(writes: readonly ShareWrite[], month: string, api: ShareApi): number {
  writes.forEach(w => api.setGroceryReceiptShare(month, w.id, w.share));
  return writes.length;
}
