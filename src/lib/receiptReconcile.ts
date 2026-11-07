import type { GroceryItem, GroceryLine } from '../types.ts';
import { money } from './grocery.js';
import { isStaged, type Choice, type Plan, type Step } from './groceryReceipt.js';

/* ---------- Receipt: reconcile items already ticked in the store (brief receipt-reconcile-ticked). For each item the plan writes that was already ticked this month, what the month
   holds now against what the receipt says; and the ticked items no included receipt line matches. Reads the plan and the month's lines, writes nothing. Pure. ---------- */

/** What a ticked line holds: a count and one price, or one price per pack. `cents` null: no price. */
interface Held { qty: number; cents: number | null; prices: number[] | null }

/** One item the plan writes that was ticked before the scan: `was` and `now` as short text, a label for the difference, and `same` when nothing changes. */
export interface Compare { id: string; was: string; now: string; label: string; same: boolean }
/** A ticked item that no included receipt line is matched to: `held` is what its line holds now, as text. */
export interface Missing { id: string; name: string; held: string }
export interface Reconciled { compare: Record<string, Compare>; missing: Missing[]; ticked: number }

/** What the month holds for a ticked line (null: not ticked). A bought line with no price of its own takes the item's price unless it was bought unpriced, as the month's totals read it. */
export function heldOf(line: GroceryLine | undefined, item: GroceryItem): Held | null {
  if (!line?.got) return null;
  if (line.prices?.length) return { qty: line.prices.length, cents: null, prices: line.prices };
  return { qty: line.qty ?? item.qty, cents: line.cents ?? (line.unpriced ? null : item.cents), prices: null };
}

const nowOf = (s: Exclude<Step, { kind: 'tax' }>): Held => (s.kind === 'single' ? { qty: s.qty, cents: s.cents, prices: null } : { qty: s.prices.length, cents: null, prices: s.prices });

/** "1 × $4.29", "3 packs: $8.99 + $9.25 + $10.49", "2.5 lb at $4.00 per lb", or "no price". */
export function heldText(h: Held, unit?: string): string {
  if (h.prices) return h.prices.length === 1 ? `1 × ${money(h.prices[0]!)}` : `${h.prices.length} packs: ${h.prices.map(money).join(' + ')}`;
  if (h.cents == null) return h.qty === 1 ? 'no price' : `${h.qty}, no price`;
  return unit ? `${h.qty} ${unit} at ${money(h.cents)} per ${unit}` : `${h.qty} × ${money(h.cents)}`;
}

const total = (h: Held): number | null => (h.prices ? h.prices.reduce((a, p) => a + p, 0) : h.cents == null ? null : Math.round(h.qty * h.cents));
const average = (h: Held): number | null => { const t = total(h); return t === null || h.qty <= 0 ? null : Math.round(t / h.qty); };
const packsOf = (h: Held): number[] | null => h.prices ?? (h.cents != null && Number.isInteger(h.qty) && h.qty >= 1 ? Array<number>(h.qty).fill(h.cents) : null);

function same(a: Held, b: Held): boolean {
  if (a.qty !== b.qty) return false;
  const pa = packsOf(a), pb = packsOf(b);
  if (pa && pb) return pa.length === pb.length && pa.every((p, i) => p === pb[i]);
  return !a.prices && !b.prices && a.cents !== null && a.cents === b.cents;
}

function labelOf(held: Held, now: Held): string {
  if (held.cents === null && !held.prices) return held.qty === now.qty ? 'Price added' : 'Price added, count changed';
  if (same(held, now)) return 'Matches the list';
  const count = held.qty !== now.qty, price = average(held) !== average(now);
  return count && price ? 'Price and count changed' : count ? 'Count changed' : 'Price changed';
}

/** The plan's items that were ticked this month, each with what changes; and the ticked items no included line is matched to (a staged item has nothing held, so it is neither). `ticked` counts the ticked items.
 *  With the receipt's `store` known, only items counted at that store or at Anywhere are in the missing list and the count: what was bought at another store, or on an earlier receipt from another one, is not "missing" from this one. */
export function reconcile(plan: Plan, choices: readonly Choice[], items: readonly GroceryItem[], lines: Readonly<Record<string, GroceryLine>>, store: string | null = null): Reconciled {
  const compare: Record<string, Compare> = {};
  for (const s of plan.steps) {
    if (s.kind === 'tax' || isStaged(s.id)) continue;
    const item = items.find(i => i.id === s.id);
    const held = item ? heldOf(lines[s.id], item) : null;
    if (!item || !held) continue;
    const now = nowOf(s);
    compare[s.id] = { id: s.id, was: heldText(held, item.unit), now: heldText(now, item.unit), label: labelOf(held, now), same: same(held, now) };
  }
  const matched = new Set(choices.flatMap(c => (c.include && c.itemId ? [c.itemId] : [])));
  const missing: Missing[] = [];
  let ticked = 0;
  for (const item of items) {
    const held = heldOf(lines[item.id], item);
    if (!held) continue;
    const at = lines[item.id]?.store ?? item.store;
    if (store && at && at.toLowerCase() !== store.toLowerCase()) continue;
    ticked++;
    if (!matched.has(item.id)) missing.push({ id: item.id, name: item.n, held: heldText(held, item.unit) });
  }
  return { compare, missing, ticked };
}

/** The line above the not-on-receipt list: when every ticked item is missing the receipt is probably the wrong one. */
export const missingIntro = (r: Pick<Reconciled, 'missing' | 'ticked'>): string =>
  `${r.ticked > 0 && r.missing.length === r.ticked ? 'None of the items you marked bought are on this receipt. Is this the right one? ' : ''}You marked these as bought, but the receipt does not show them. Maybe you put them back, or the photo missed them (a photo cut off at the bottom can hide lines). Tick one to move it back to your to-get list. Anything you leave alone stays marked bought.`;

/** The Applied notice's words for the items that were moved back to to-get. */
export const untickedText = (n: number): string => (n > 0 ? ` ${n} ${n === 1 ? 'item' : 'items'} moved back to to-get.` : '');
