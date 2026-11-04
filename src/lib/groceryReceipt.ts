import type { GroceryItem, GroceryLine, GroceryUnit } from '../types.ts';
import type { GroceryForm } from '../store/types.ts';
import type { Receipt, ReceiptLine, ReceiptUnit } from '../shared/receipt.js';
import { MAX_ITEMS, MAX_PRICES, centsText, cleanQty, lineTotal, money, parseDollars } from './grocery.js';

/* ---------- Receipt scan (brief receipt-scan): from the lines on a receipt and the person's choices to the grocery writes, and the total check. Pure; the sheet calls
   `planReceipt`, and `applyPlan` / `restoreSnapshot` run it through the store actions that already exist (so the usual price and count rules are the same as
   typing them). Nothing here reads the photo. ---------- */

/** What the person chose for one receipt line: the item it goes to (null: none) and whether it is ticked. */
export interface Choice { itemId: string | null; include: boolean }

export type Step =
  | { kind: 'single'; id: string; qty: number; cents: number } // a count and one unit price (a weighed item: the weight and the price per unit)
  | { kind: 'prices'; id: string; prices: number[] } // one price per pack, when the packs cost different amounts
  | { kind: 'tax'; store: string; cents: number };

/** An item the person added from the sheet (brief receipt-add-item): it exists only in the sheet until Apply creates it. Its id starts with `new:` so a choice can point at it like any item. */
export interface Staged { id: string; n: string; store: string; qty: number; cents: number | null; unit?: GroceryUnit }
export const STAGED_PREFIX = 'new:';
export const isStaged = (id: string | null | undefined): boolean => !!id && id.startsWith(STAGED_PREFIX);
/** The form's text fields for a new item: the draft the person edits before it is staged. `store` '' is Anywhere. */
export interface ItemDraft { n: string; store: string; qty: string; price: string; unit: GroceryUnit | '' }

export interface Check { linesCents: number; taxCents: number; totalCents: number | null; diffCents: number | null }
/** `notes` says why a ticked line was left out of the writes (by line index): a weight that cannot be matched to the item's unit. */
export interface Plan { steps: Step[]; items: number; itemsCents: number; check: Check; taxStore: string | null; notes: Record<number, string> }

const GRAMS: Record<ReceiptUnit, number> = { lb: 453.59237, kg: 1000, oz: 28.349523125 };
/** A weight in another unit (2.2 lb in kg is 1), to two decimals, the way a count is kept. */
export const convertWeight = (qty: number, from: ReceiptUnit, to: ReceiptUnit): number => Math.round((qty * GRAMS[from] / GRAMS[to]) * 100) / 100;

export const netOf = (l: Pick<ReceiptLine, 'grossCents' | 'discountCents'>): number => l.grossCents - l.discountCents;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** The catalogue store a receipt's store name belongs to ("BJS WHOLESALE CLUB" is "BJ's"), or null. A name must be at least 3 letters to match. */
export function matchStore(receiptStore: string | undefined, stores: readonly string[]): string | null {
  const r = norm(receiptStore ?? '');
  if (r.length < 3) return null;
  return stores.find(s => { const n = norm(s); return n.length >= 3 && (r.includes(n) || n.includes(r)); }) ?? null;
}

/** `n` packs that add up to `total` cents exactly: the cents that do not divide evenly go one each to the first packs. */
export function splitCents(total: number, n: number): number[] {
  const base = Math.floor(total / n), rest = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/** Lines plus tax against the receipt total: `diffCents` is the part of the total the lines do not explain (null when the receipt printed no total). */
export function checkTotals(receipt: Receipt): Check {
  const linesCents = receipt.lines.reduce((a, l) => a + netOf(l), 0);
  const taxCents = receipt.taxCents ?? 0;
  const totalCents = receipt.totalCents ?? null;
  return { linesCents, taxCents, totalCents, diffCents: totalCents === null ? null : totalCents - linesCents - taxCents };
}

/** The writes for the ticked, matched lines. Two lines for one item are added up; a weighed item takes the weight and a price per unit; any other item becomes packs whose prices add up to the net total to the cent. */
export function planReceipt(receipt: Receipt, choices: readonly Choice[], listItems: readonly GroceryItem[], taxStore: string | null, staged: readonly Staged[] = []): Plan {
  const items = staged.length ? [...listItems, ...staged.map((x): GroceryItem => ({ id: x.id, n: x.n, store: x.store, qty: x.qty, cents: x.cents, every: true, out: false, ...(x.unit ? { unit: x.unit } : {}) }))] : listItems; // a staged item plans like a matched one
  const byItem = new Map<string, { l: ReceiptLine; qty: number }[]>();
  const notes: Record<number, string> = {};
  receipt.lines.forEach((l, i) => {
    const c = choices[i];
    if (!c || !c.include || !c.itemId || l.grossCents <= 0) return;
    const item = items.find(x => x.id === c.itemId);
    let qty = l.qty;
    if (item?.unit) {
      // A weighed item takes a weight in its own unit: convert a weighed line, and leave out a line sold by count (its quantity is not a weight).
      if (!l.unit) { notes[i] = `Sold by count on the receipt, but ${item.n} is kept by ${item.unit}. Not applied.`; return; }
      qty = l.unit === item.unit ? l.qty : convertWeight(l.qty, l.unit, item.unit);
    } else if (l.unit) qty = 1; // a weighed line for an item kept by count is one purchase, not a number of packs
    byItem.set(c.itemId, [...(byItem.get(c.itemId) ?? []), { l, qty }]);
  });
  const steps: Step[] = [];
  let itemsCents = 0;
  for (const [id, rows] of byItem) {
    const item = items.find(i => i.id === id);
    if (!item) continue;
    const net = rows.reduce((a, r) => a + netOf(r.l), 0);
    if (item.unit) {
      const qty = Math.round(rows.reduce((a, r) => a + r.qty, 0) * 100) / 100;
      if (qty <= 0) continue;
      const cents = Math.round(net / qty);
      steps.push({ kind: 'single', id, qty, cents });
      itemsCents += lineTotal(qty, cents);
      continue;
    }
    const packs = rows.flatMap(r => splitCents(netOf(r.l), Number.isInteger(r.qty) && r.qty >= 1 ? r.qty : 1));
    if (packs.length > MAX_PRICES) { const cents = Math.round(net / packs.length); steps.push({ kind: 'single', id, qty: packs.length, cents }); itemsCents += lineTotal(packs.length, cents); continue; }
    if (packs.every(p => p === packs[0])) steps.push({ kind: 'single', id, qty: packs.length, cents: packs[0]! });
    else steps.push({ kind: 'prices', id, prices: packs });
    itemsCents += packs.reduce((a, p) => a + p, 0);
  }
  const taxOn = taxStore !== null && (receipt.taxCents ?? 0) > 0;
  if (taxOn) steps.push({ kind: 'tax', store: taxStore, cents: receipt.taxCents! });
  return { steps, items: steps.filter(s => s.kind !== 'tax').length, itemsCents, check: checkTotals(receipt), taxStore: taxOn ? taxStore : null, notes };
}

/** "Total check" in words for the sheet: whether the lines and tax explain the receipt total, and what is left over when they do not. */
export function checkText(c: Check): { ok: boolean; text: string } {
  if (c.diffCents === null) return { ok: true, text: 'This receipt shows no total to check against.' };
  if (c.diffCents === 0) return { ok: true, text: 'Total check: lines plus tax match the receipt.' };
  const more = c.diffCents > 0;
  return { ok: false, text: `${money(Math.abs(c.diffCents))} ${more ? 'on the receipt is not in the lines. A line may be missing from the photo.' : 'in the lines is more than the receipt total. A line may have been read twice.'} You can still apply.` };
}

/** The store actions Apply and Undo use. All exist already except `restoreGroceryLine`, which puts back one line exactly as it was. `removeGroceryItem` with `quiet` removes an item Apply created without the usual Removed notice, which would compete with the receipt Undo. */
export interface GroceryApi {
  removeGroceryItem(id: string, opts?: { quiet?: boolean }): void;
  setGroceryGot(month: string, id: string, on: boolean): boolean;
  setGroceryQty(month: string, id: string, qty: number): void;
  setGroceryCents(month: string, id: string, cents: number | null): void;
  setGroceryPrices(month: string, id: string, prices: number[] | null): void;
  setGroceryTax(month: string, store: string, cents: number | null): void;
  restoreGroceryLine(month: string, id: string, line: GroceryLine | null): void;
  updateGroceryItem(id: string, patch: Partial<{ qty: number; cents: number | null }>): string | null;
}
/** `created`: ids of the items Apply made from staged ones, which Undo removes (left out when there are none). */
export interface Snapshot { month: string; lines: Record<string, GroceryLine | null>; usual: Record<string, { qty: number; cents: number | null }>; tax: { store: string; cents: number | null } | null; created?: string[] }

/** What Apply is about to change, so Undo can put it back: each touched line as it is now (null: none), each item's usual count and price, and the store's tax. */
export function takeSnapshot(plan: Plan, month: string, lines: Record<string, GroceryLine>, items: readonly GroceryItem[], tax: Record<string, number> | undefined, created: readonly string[] = []): Snapshot {
  const snap: Snapshot = { month, lines: {}, usual: {}, tax: null, ...(created.length ? { created: [...created] } : {}) };
  for (const s of plan.steps) {
    if (s.kind === 'tax') { snap.tax = { store: s.store, cents: tax?.[s.store] ?? null }; continue; }
    snap.lines[s.id] = lines[s.id] ? structuredClone(lines[s.id]!) : null;
    const it = created.includes(s.id) ? undefined : items.find(i => i.id === s.id); // a created item is removed on Undo, so its usual values need no restoring
    if (it) snap.usual[s.id] = { qty: it.qty, cents: it.cents };
  }
  return snap;
}

/** Runs the plan: each item is ticked bought for the month, then gets its count and price (or its packs' prices), and the store's tax is set. Returns how many items were written. */
export function applyPlan(plan: Plan, month: string, api: GroceryApi): number {
  let done = 0;
  for (const s of plan.steps) {
    if (s.kind === 'tax') { api.setGroceryTax(month, s.store, s.cents); continue; }
    if (!api.setGroceryGot(month, s.id, true)) continue; // false: nothing changed (sync still loading)
    if (s.kind === 'single') { api.setGroceryQty(month, s.id, s.qty); api.setGroceryCents(month, s.id, s.cents); } else api.setGroceryPrices(month, s.id, s.prices);
    done++;
  }
  return done;
}

export function restoreSnapshot(snap: Snapshot, api: GroceryApi): void {
  for (const [id, line] of Object.entries(snap.lines)) api.restoreGroceryLine(snap.month, id, line);
  for (const [id, u] of Object.entries(snap.usual)) api.updateGroceryItem(id, u);
  if (snap.tax) api.setGroceryTax(snap.month, snap.tax.store, snap.tax.cents);
  for (const id of snap.created ?? []) api.removeGroceryItem(id, { quiet: true }); // after its line is gone
}

/* ---------- Add to list (brief receipt-add-item) ---------- */
/** A receipt's capitals tidied for a name: "ZEVIA SODA 12PK" becomes "Zevia soda 12pk"; spaces collapsed, at most 80 characters. */
export function tidyName(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ').slice(0, 80).toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** The form's starting values for a receipt line: a tidied name, the receipt's store (or `pickedStore`) when it is on the list else Anywhere (''), the count and the net price per unit (so a discount is counted); a weighed line gives its weight and unit. */
export function proposeItem(line: ReceiptLine, receiptStore: string | undefined, stores: readonly string[], pickedStore = ''): ItemDraft {
  const qty = line.qty > 0 ? line.qty : 1;
  const net = netOf(line);
  return { n: tidyName(line.text), store: matchStore(receiptStore, stores) ?? pickedStore, qty: String(qty), price: net > 0 ? centsText(Math.round(net / qty)) : '', unit: line.unit ?? '' };
}

/** The draft as a staged item, or the plain message for what is wrong (the same words the Edit form uses). Nothing is written. */
export function stageDraft(d: ItemDraft, listItems: readonly GroceryItem[], staged: readonly Staged[], id: string): { ok: true; item: Staged } | { ok: false; error: string } {
  const n = d.n.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!n) return { ok: false, error: 'Give the item a name.' };
  const qty = d.qty.trim() === '' ? 1 : cleanQty(d.qty);
  if (qty == null || qty <= 0) return { ok: false, error: 'The count must be a number from 0.01 to 999.' };
  const priceText = d.price.trim();
  const cents = priceText === '' ? null : parseDollars(priceText);
  if (priceText !== '' && cents == null) return { ok: false, error: 'The price must be dollars, like 3.49.' };
  const store = d.store.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (listItems.length + staged.length >= MAX_ITEMS) return { ok: false, error: `The list is full (${MAX_ITEMS} items).` };
  const same = (x: { n: string; store: string }) => x.n.toLowerCase() === n.toLowerCase() && x.store.toLowerCase() === store.toLowerCase();
  if (listItems.some(same) || staged.some(same)) return { ok: false, error: 'That item is already in this store’s list. Pick it in the list instead.' };
  return { ok: true, item: { id, n, store, qty, cents, ...(d.unit ? { unit: d.unit } : {}) } };
}

/** What `createStaged` needs from the store: the add action and a fresh read of the list (the new id is found by comparing before and after, since the action returns only an error text). */
export interface CreateApi { addGroceryItem(d: GroceryForm): string | null; items(): readonly GroceryItem[] }
export interface Created { ids: Record<string, string>; created: Staged[]; refused: string[] }

/** Creates each staged item the plan uses, once. A refusal (the name is there already, the list is full) is named and the rest go on. */
export function createStaged(plan: Plan, staged: readonly Staged[], api: CreateApi): Created {
  const used = new Set(plan.steps.flatMap(s => (s.kind === 'tax' ? [] : [s.id])));
  const out: Created = { ids: {}, created: [], refused: [] };
  for (const st of staged) {
    if (!used.has(st.id)) continue;
    const before = new Set(api.items().map(i => i.id));
    const err = api.addGroceryItem({ n: st.n, store: st.store, qty: String(st.qty), price: centsText(st.cents), every: true, unit: st.unit ?? '' });
    const made = err === null ? api.items().find(i => !before.has(i.id) && i.n.toLowerCase() === st.n.toLowerCase() && i.store.toLowerCase() === st.store.toLowerCase()) : undefined; // new, and the one just added (not a synced arrival)
    if (!made) { out.refused.push(`${st.n} (${err ?? 'it was not saved'})`); continue; }
    out.ids[st.id] = made.id; out.created.push(st);
  }
  return out;
}

/** The plan with each staged id swapped for the id of the item that was made; a step whose item could not be made is dropped. */
export function remapPlan(plan: Plan, ids: Record<string, string>): Plan {
  const steps = plan.steps.flatMap((s): Step[] => {
    if (s.kind === 'tax' || !isStaged(s.id)) return [s];
    const id = ids[s.id];
    return id ? [{ ...s, id }] : [];
  });
  const itemsCents = steps.reduce((a, s) => a + (s.kind === 'single' ? lineTotal(s.qty, s.cents) : s.kind === 'prices' ? s.prices.reduce((x, y) => x + y, 0) : 0), 0);
  return { ...plan, steps, items: steps.filter(s => s.kind !== 'tax').length, itemsCents };
}

/** "Added Zevia soda 12pk to BJ's." for the Undo notice, and what could not be added. */
export function addedText(created: readonly Pick<Staged, 'n' | 'store'>[], refused: readonly string[]): string {
  const added = created.length ? ` Added ${created.map(c => `${c.n} to ${c.store || 'Anywhere'}`).join(' and ')}.` : '';
  return `${added}${refused.length ? ` Could not add: ${refused.join(', ')}.` : ''}`;
}
