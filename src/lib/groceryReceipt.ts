import type { GroceryItem, GroceryLine } from '../types.ts';
import type { Receipt, ReceiptLine } from '../shared/receipt.js';
import { MAX_PRICES, lineTotal, money } from './grocery.js';

/* ---------- Receipt scan (brief receipt-scan): from the lines on a receipt and the person's choices to the grocery writes, and the total check. Pure; the sheet calls
   `planReceipt`, and `applyPlan` / `restoreSnapshot` run it through the store actions that already exist (so the usual price and count rules are the same as
   typing them). Nothing here reads the photo. ---------- */

/** What the person chose for one receipt line: the item it goes to (null: none) and whether it is ticked. */
export interface Choice { itemId: string | null; include: boolean }

export type Step =
  | { kind: 'single'; id: string; qty: number; cents: number } // a count and one unit price (a weighed item: the weight and the price per unit)
  | { kind: 'prices'; id: string; prices: number[] } // one price per pack, when the packs cost different amounts
  | { kind: 'tax'; store: string; cents: number };

export interface Check { linesCents: number; taxCents: number; totalCents: number | null; diffCents: number | null }
export interface Plan { steps: Step[]; items: number; itemsCents: number; check: Check; taxStore: string | null }

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
export function planReceipt(receipt: Receipt, choices: readonly Choice[], items: readonly GroceryItem[], taxStore: string | null): Plan {
  const byItem = new Map<string, ReceiptLine[]>();
  receipt.lines.forEach((l, i) => {
    const c = choices[i];
    if (!c || !c.include || !c.itemId || l.grossCents <= 0) return;
    byItem.set(c.itemId, [...(byItem.get(c.itemId) ?? []), l]);
  });
  const steps: Step[] = [];
  let itemsCents = 0;
  for (const [id, lines] of byItem) {
    const item = items.find(i => i.id === id);
    if (!item) continue;
    const net = lines.reduce((a, l) => a + netOf(l), 0);
    if (item.unit) {
      const qty = Math.round(lines.reduce((a, l) => a + l.qty, 0) * 100) / 100;
      if (qty <= 0) continue;
      const cents = Math.round(net / qty);
      steps.push({ kind: 'single', id, qty, cents });
      itemsCents += lineTotal(qty, cents);
      continue;
    }
    const packs = lines.flatMap(l => splitCents(netOf(l), Number.isInteger(l.qty) && l.qty >= 1 ? l.qty : 1));
    if (packs.length > MAX_PRICES) { const cents = Math.round(net / packs.length); steps.push({ kind: 'single', id, qty: packs.length, cents }); itemsCents += lineTotal(packs.length, cents); continue; }
    if (packs.every(p => p === packs[0])) steps.push({ kind: 'single', id, qty: packs.length, cents: packs[0]! });
    else steps.push({ kind: 'prices', id, prices: packs });
    itemsCents += packs.reduce((a, p) => a + p, 0);
  }
  const taxOn = taxStore !== null && (receipt.taxCents ?? 0) > 0;
  if (taxOn) steps.push({ kind: 'tax', store: taxStore, cents: receipt.taxCents! });
  return { steps, items: steps.filter(s => s.kind !== 'tax').length, itemsCents, check: checkTotals(receipt), taxStore: taxOn ? taxStore : null };
}

/** "Total check" in words for the sheet: whether the lines and tax explain the receipt total, and what is left over when they do not. */
export function checkText(c: Check): { ok: boolean; text: string } {
  if (c.diffCents === null) return { ok: true, text: 'This receipt shows no total to check against.' };
  if (c.diffCents === 0) return { ok: true, text: 'Total check: lines plus tax match the receipt.' };
  const more = c.diffCents > 0;
  return { ok: false, text: `${money(Math.abs(c.diffCents))} ${more ? 'on the receipt is not in the lines. A line may be missing from the photo.' : 'in the lines is more than the receipt total. A line may have been read twice.'} You can still apply.` };
}

/** The store actions Apply and Undo use. All exist already except `restoreGroceryLine`, which puts back one line exactly as it was. */
export interface GroceryApi {
  setGroceryGot(month: string, id: string, on: boolean): boolean;
  setGroceryQty(month: string, id: string, qty: number): void;
  setGroceryCents(month: string, id: string, cents: number | null): void;
  setGroceryPrices(month: string, id: string, prices: number[] | null): void;
  setGroceryTax(month: string, store: string, cents: number | null): void;
  restoreGroceryLine(month: string, id: string, line: GroceryLine | null): void;
  updateGroceryItem(id: string, patch: Partial<{ qty: number; cents: number | null }>): string | null;
}
export interface Snapshot { month: string; lines: Record<string, GroceryLine | null>; usual: Record<string, { qty: number; cents: number | null }>; tax: { store: string; cents: number | null } | null }

/** What Apply is about to change, so Undo can put it back: each touched line as it is now (null: none), each item's usual count and price, and the store's tax. */
export function takeSnapshot(plan: Plan, month: string, lines: Record<string, GroceryLine>, items: readonly GroceryItem[], tax: Record<string, number> | undefined): Snapshot {
  const snap: Snapshot = { month, lines: {}, usual: {}, tax: null };
  for (const s of plan.steps) {
    if (s.kind === 'tax') { snap.tax = { store: s.store, cents: tax?.[s.store] ?? null }; continue; }
    snap.lines[s.id] = lines[s.id] ? structuredClone(lines[s.id]!) : null;
    const it = items.find(i => i.id === s.id);
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
}
