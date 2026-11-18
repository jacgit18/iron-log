import type { GroceryMonth, RcptEntry } from '../types.ts';
import { MAX_CENTS } from '../shared/grocery.js';

/* ---------- Receipt ledger (brief receipt-tax-adds-up). A month keeps one tax and one rewards total per store; a receipt Apply adds its part to that total and
   writes a ledger entry, so a second receipt from the same store adds instead of replacing, Undo takes back exactly that part, and a receipt applied twice is
   noticed. The functions here change the month they are given (the store action hands them its own copy) and are pure otherwise. ---------- */

export type MoneyField = 'tax' | 'credit';

/** The ledger key of a receipt: the store, its date (`?` when unread), the printed total and the tax. Two receipts that agree on all four are taken to be the same one. */
export const receiptKey = (store: string, date: string | undefined, totalCents: number | undefined, taxCents: number | undefined): string => `${store}|${date ?? '?'}|${totalCents ?? '?'}|${taxCents ?? 0}`;

/** The key already in the ledger that `key` repeats (itself, or one added again with `#n`), or null. */
export function duplicateOf(rcpts: Readonly<Record<string, RcptEntry>> | undefined, key: string): string | null {
  if (!rcpts) return null;
  return Object.keys(rcpts).find(k => k === key || k.startsWith(`${key}#`)) ?? null;
}

/** `key`, or `key#2`, `key#3` ... when the receipt is applied again on purpose: a key not in the ledger yet. */
export function freshKey(rcpts: Readonly<Record<string, RcptEntry>> | undefined, key: string): string {
  if (!rcpts || !(key in rcpts)) return key;
  for (let n = 2; ; n++) if (!((`${key}#${n}`) in rcpts)) return `${key}#${n}`;
}

/** How many ledger receipts put tax (or rewards) into this store's total: the "From N receipts" note. */
export const receiptCount = (m: Pick<GroceryMonth, 'rcpts'> | undefined, store: string, field: MoneyField): number =>
  Object.values(m?.rcpts ?? {}).filter(e => e.store === store && (e[field] ?? 0) > 0).length;

/** The note beside a Tax or Rewards box: how many applied receipts its total holds (only shown from one up). */
export const receiptsText = (n: number): string => `From ${n} ${n === 1 ? 'receipt' : 'receipts'}`;

const bump = (m: GroceryMonth, field: MoneyField, store: string, by: number) => {
  const next = Math.min(MAX_CENTS, Math.max(0, (m[field]?.[store] ?? 0) + by));
  const map = { ...(m[field] ?? {}) };
  if (next > 0) map[store] = next; else delete map[store];
  if (Object.keys(map).length) m[field] = map; else delete m[field];
};

/** Adds a receipt's tax and rewards to the store's totals and records it under `key`. Returns false (nothing changed) when the key is already there, the store is empty or the receipt has neither amount. */
export function addReceiptMoney(m: GroceryMonth, key: string, store: string, tax: number, credit: number): boolean {
  if (!store || (tax <= 0 && credit <= 0) || (m.rcpts && key in m.rcpts)) return false;
  if (tax > 0) bump(m, 'tax', store, tax);
  if (credit > 0) bump(m, 'credit', store, credit);
  m.rcpts = { ...(m.rcpts ?? {}), [key]: { store, ...(tax > 0 ? { tax } : {}), ...(credit > 0 ? { credit } : {}) } };
  return true;
}

/** Takes one receipt's part back out of the totals, whatever they were typed to since (never below none), and drops its entry. Returns false when the entry is gone. */
export function removeReceiptMoney(m: GroceryMonth, key: string): boolean {
  const e = m.rcpts?.[key];
  if (!e) return false;
  if (e.tax) bump(m, 'tax', e.store, -e.tax);
  if (e.credit) bump(m, 'credit', e.store, -e.credit);
  const rest = { ...m.rcpts }; delete rest[key];
  if (Object.keys(rest).length) m.rcpts = rest; else delete m.rcpts;
  return true;
}

/** The sync merge of one money field (ADR: receipt-tax-adds-up). Per store: equal sides, or one side unchanged, as before. When both sides changed it and each change is exactly the receipts it added or took back
 *  (so neither typed the box), the result is the base plus the receipts of both sides, a receipt both added counted once. Any other conflict goes to this device, as a typed value always did.
 *  Without a base nothing can be told apart: this device's value over the other's. */
export function mergeMoney(field: MoneyField, base: GroceryMonth | null, ours: GroceryMonth, theirs: GroceryMonth): Record<string, number> {
  if (!base) return { ...theirs[field], ...ours[field] };
  const out: Record<string, number> = {};
  const stores = new Set([...Object.keys(ours[field] ?? {}), ...Object.keys(theirs[field] ?? {}), ...Object.keys(base[field] ?? {})]);
  for (const s of stores) {
    const b = base[field]?.[s] ?? 0, o = ours[field]?.[s] ?? 0, t = theirs[field]?.[s] ?? 0;
    let v = o === t || t === b ? o : o === b ? t : null;
    if (v === null) {
      const added = (side: GroceryMonth) => Object.entries(side.rcpts ?? {}).filter(([k, e]) => !(k in (base.rcpts ?? {})) && e.store === s && e[field]);
      const removed = (side: GroceryMonth) => Object.entries(base.rcpts ?? {}).filter(([k, e]) => !(k in (side.rcpts ?? {})) && e.store === s && e[field]);
      const sum = (es: [string, RcptEntry][]) => es.reduce((a, [, e]) => a + (e[field] ?? 0), 0);
      const delta = (side: GroceryMonth) => sum(added(side)) - sum(removed(side));
      if (o - b === delta(ours) && t - b === delta(theirs)) {
        const union = (a: [string, RcptEntry][], c: [string, RcptEntry][]) => [...a, ...c.filter(([k]) => !a.some(([x]) => x === k))];
        v = Math.min(MAX_CENTS, Math.max(0, b + sum(union(added(ours), added(theirs))) - sum(union(removed(ours), removed(theirs)))));
      } else v = o;
    }
    if (v > 0) out[s] = v;
  }
  return out;
}

/** The ledger of a merged month: key by key, three-way, this device winning a conflict (a receipt applied on one device and undone on the other is a conflict only when both touched the same key). */
export function mergeLedger(base: GroceryMonth | null, ours: GroceryMonth, theirs: GroceryMonth): Record<string, RcptEntry> {
  const out: Record<string, RcptEntry> = {};
  const b = base?.rcpts ?? {}, o = ours.rcpts ?? {}, t = theirs.rcpts ?? {};
  for (const k of new Set([...Object.keys(o), ...Object.keys(t), ...Object.keys(b)])) {
    const same = (x: RcptEntry | undefined, y: RcptEntry | undefined) => JSON.stringify(x) === JSON.stringify(y);
    const v = !base ? o[k] ?? t[k] : same(o[k], b[k]) ? t[k] : o[k];
    if (v) out[k] = v;
  }
  return out;
}
