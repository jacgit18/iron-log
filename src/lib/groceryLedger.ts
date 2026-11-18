import type { GroceryMonth, RcptEntry } from '../types.ts';
import { MAX_CENTS } from '../shared/grocery.js';

/* ---------- Receipt ledger (brief receipt-tax-adds-up). A month keeps one tax and one rewards total per store; a receipt Apply adds its part to that total and
   writes a ledger entry, so a second receipt from the same store adds instead of replacing, Undo takes back exactly that part, and a receipt applied twice is
   noticed. The functions here change the month they are given (the store action hands them its own copy) and are pure otherwise. ---------- */

export type MoneyField = 'tax' | 'credit';

/** The ledger key of a receipt: the store, its date (`?` when unread), the printed total and the tax. Two receipts that agree on all four are taken to be the same one. */
export const receiptKey = (store: string, date: string | undefined, totalCents: number | undefined, taxCents: number | undefined, creditCents = 0): string => `${store}|${date ?? '?'}|${totalCents ?? '?'}|${taxCents ?? 0}${creditCents > 0 ? `|r${creditCents}` : ''}`;

/** A receipt with neither a date nor a total says too little to tell it from another one, so it is never taken for a repeat (it still gets its own key, `#n` when the key is taken). */
export const guardable = (key: string): boolean => !key.includes('|?|?|');

/** The key already in the ledger that `key` repeats (itself, or one added again with `#n`), or null. */
export function duplicateOf(rcpts: Readonly<Record<string, RcptEntry>> | undefined, key: string): string | null {
  if (!rcpts || !guardable(key)) return null;
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

type Entries = [string, RcptEntry][];
const FIELDS: MoneyField[] = ['tax', 'credit'];
const entriesOf = (m: GroceryMonth, s: string): Entries => Object.entries(m.rcpts ?? {}).filter(([, e]) => e.store === s);
const sumOf = (es: Entries, f: MoneyField) => es.reduce((a, [, e]) => a + (e[f] ?? 0), 0);
const unionOf = (a: Entries, c: Entries): Entries => [...a, ...c.filter(([k]) => !a.some(([x]) => x === k))];

/** The sync merge of the money of a month: each store's tax and rewards totals and the ledger of applied receipts, merged together so the ledger always explains the totals (ADR 137).
 *  Per store and field: equal sides, or one side unchanged, as before. When both changed and each change is exactly the receipts that side added or took back (neither typed the box), the result is
 *  the base plus the receipts of both sides, a receipt both added counted once. Without a base the same holds when each side's totals equal the sum of its own receipts.
 *  Any other conflict goes to this device for the whole store (both totals and its receipts), as a typed value always did, so no receipt of the other side stays in the ledger without its money. */
export function mergeReceiptMoney(base: GroceryMonth | null, ours: GroceryMonth, theirs: GroceryMonth): { tax: Record<string, number>; credit: Record<string, number>; rcpts: Record<string, RcptEntry> } {
  const out = { tax: {} as Record<string, number>, credit: {} as Record<string, number>, rcpts: mergeLedgerKeys(base, ours, theirs) };
  const stores = new Set<string>();
  for (const m of [base, ours, theirs]) if (m) { for (const f of FIELDS) Object.keys(m[f] ?? {}).forEach(s => stores.add(s)); Object.values(m.rcpts ?? {}).forEach(e => stores.add(e.store)); }
  for (const s of stores) {
    const get = (m: GroceryMonth | null, f: MoneyField) => m?.[f]?.[s] ?? 0;
    const oE = entriesOf(ours, s), tE = entriesOf(theirs, s);
    const vals: Record<string, number | null> = {};
    for (const f of FIELDS) {
      const b = get(base, f), o = get(ours, f), t = get(theirs, f);
      if (!base) {
        const explained = sumOf(oE, f) === o && sumOf(tE, f) === t;
        vals[f] = o === t ? o : explained ? Math.min(MAX_CENTS, sumOf(unionOf(oE, tE), f)) : null;
      } else if (o === t || t === b) vals[f] = o;
      else if (o === b) vals[f] = t;
      else {
        const bE = entriesOf(base, s), has = (es: Entries, k: string) => es.some(([x]) => x === k);
        const added = (side: Entries) => side.filter(([k]) => !has(bE, k)), removed = (side: Entries) => bE.filter(([k]) => !has(side, k));
        const clamped = (n: number) => n < 0 || n > MAX_CENTS;
        const ok = (v: number, side: Entries) => !clamped(b + sumOf(added(side), f) - sumOf(removed(side), f)) && v - b === sumOf(added(side), f) - sumOf(removed(side), f);
        vals[f] = ok(o, oE) && ok(t, tE) ? b + sumOf(unionOf(added(oE), added(tE)), f) - sumOf(unionOf(removed(oE), removed(tE)), f) : null;
      }
    }
    if (FIELDS.some(f => vals[f] === null)) { // a conflict this device wins: the whole store is ours (or theirs when we hold nothing for it, with no base)
      const src = !base && !FIELDS.some(f => get(ours, f)) && !oE.length ? theirs : ours;
      for (const f of FIELDS) { const v = get(src, f); if (v > 0) out[f][s] = v; }
      for (const k of Object.keys(out.rcpts)) if (out.rcpts[k]!.store === s) delete out.rcpts[k];
      for (const [k, e] of entriesOf(src, s)) out.rcpts[k] = e;
    } else for (const f of FIELDS) if (vals[f]! > 0) out[f][s] = vals[f]!;
  }
  return out;
}

/** One money field of `mergeReceiptMoney` (kept for the unit tests). */
export const mergeMoney = (field: MoneyField, base: GroceryMonth | null, ours: GroceryMonth, theirs: GroceryMonth): Record<string, number> => mergeReceiptMoney(base, ours, theirs)[field];

/** The ledger of a merged month: key by key, three-way, this device winning a conflict (a receipt applied on one device and undone on the other is a conflict only when both touched the same key). */
export function mergeLedgerKeys(base: GroceryMonth | null, ours: GroceryMonth, theirs: GroceryMonth): Record<string, RcptEntry> {
  const out: Record<string, RcptEntry> = {};
  const b = base?.rcpts ?? {}, o = ours.rcpts ?? {}, t = theirs.rcpts ?? {};
  for (const k of new Set([...Object.keys(o), ...Object.keys(t), ...Object.keys(b)])) {
    const same = (x: RcptEntry | undefined, y: RcptEntry | undefined) => JSON.stringify(x) === JSON.stringify(y);
    const v = !base ? o[k] ?? t[k] : same(o[k], b[k]) ? t[k] : o[k];
    if (v) out[k] = v;
  }
  return out;
}

/** The ledger of a merged month (see `mergeReceiptMoney`, which also fixes it up against the totals). */
export const mergeLedger = (base: GroceryMonth | null, ours: GroceryMonth, theirs: GroceryMonth): Record<string, RcptEntry> => mergeReceiptMoney(base, ours, theirs).rcpts;
