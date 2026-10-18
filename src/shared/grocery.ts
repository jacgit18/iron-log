import type { GroceryItem, GroceryLine, GroceryMonth, GroceryStore, GroceryUnit } from '../types.ts';
import { str } from './stretchWeek.js';

/* ---------- Grocery list shapes: one item, one store, one month ----------
   The cleaning rules for the grocery list, shared by the app and the API (ADR 015), so the server holds what the app would.
   The cleaners take anything and return the clean value (or null when it can't be used); the `valid*` checks are stricter and
   say whether a value is already clean, for the API to refuse what the app would never send (ADR 039). */

export const MAX_ITEMS = 500, MAX_STORES = 30, MAX_QTY = 999, MAX_CENTS = 99_999_999;
export const MAX_ID = 60, MAX_NAME = 80, MAX_STORE = 40, MAX_NOTE = 120;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const UNITS: readonly GroceryUnit[] = ['kg', 'lb', 'oz'];
const cleanUnit = (v: unknown): GroceryUnit | null => UNITS.find(u => u === v) ?? null;

export const emptyMonth = (): GroceryMonth => ({ lines: {}, pulled: [] });

export const cleanQty = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_QTY ? Math.round(n * 100) / 100 : null;
};
export const cleanCents = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_CENTS ? v : null);

const asObject = (x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);

/** One catalogue item, cleaned. Older data has `once` (an occasional item) instead of `every`: it becomes a When-out item that is
 *  not out, which is how it behaved (ADR 038). */
export function normGroceryItem(x: unknown): GroceryItem | null {
  const o = asObject(x);
  if (!o) return null;
  const id = str(o.id, MAX_ID), n = str(o.n, MAX_NAME);
  if (!id || !n || id === '__proto__') return null;
  const every = o.every === true || (o.every === undefined && o.once !== true);
  const qty = cleanQty(o.qty);
  const note = str(o.note, MAX_NOTE); const unit = cleanUnit(o.unit);
  return { id, n, store: str(o.store, MAX_STORE), qty: qty && qty > 0 ? qty : 1, cents: cleanCents(o.cents), every, out: !every && o.out === true, ...(note ? { note } : {}), ...(unit ? { unit } : {}) };
}

/** One store, as a row of its own: the name is its id. */
export function normGroceryStore(x: unknown): GroceryStore | null {
  const o = asObject(x);
  const n = o ? str(o.n ?? o.id, MAX_STORE) : '';
  return n && n !== '__proto__' ? { id: n, n } : null;
}

const exact = (v: unknown, max: number, allowEmpty = false) => typeof v === 'string' && v === v.trim() && v.length <= max && (allowEmpty || v.length > 0);

/** True when `x` is a catalogue item exactly as the app writes one: names within their lengths, a count from 0.01 to 999, a price in whole
 *  cents or none, and the two mode flags. The API refuses anything else rather than cleaning it into something the user never typed. */
export function validGroceryItem(x: unknown): x is GroceryItem {
  const o = asObject(x);
  if (!o || !exact(o.id, MAX_ID) || o.id === '__proto__' || !exact(o.n, MAX_NAME) || !exact(o.store, MAX_STORE, true)) return false;
  if (typeof o.qty !== 'number' || cleanQty(o.qty) !== o.qty || o.qty <= 0) return false;
  if (o.cents !== null && cleanCents(o.cents) === null) return false;
  if (o.note !== undefined && !exact(o.note, MAX_NOTE)) return false;
  if (o.unit !== undefined && cleanUnit(o.unit) === null) return false;
  if (typeof o.every !== 'boolean' || typeof o.out !== 'boolean' || (o.every && o.out)) return false;
  return true;
}

export function validGroceryStore(x: unknown): x is GroceryStore {
  const o = asObject(x);
  return !!o && exact(o.n, MAX_STORE) && o.id === o.n && o.n !== '__proto__';
}

/** One month's list: ticks, counts and prices by item id, and the old `pulled` ids. At most MAX_ITEMS of each. */
export function normGroceryMonth(d: unknown): GroceryMonth {
  const raw = asObject(d) ?? {};
  const lines: Record<string, GroceryLine> = {};
  const rawLines = asObject(raw.lines);
  if (rawLines) {
    Object.entries(rawLines).slice(0, MAX_ITEMS).forEach(([id, v]) => {
      const o = asObject(v);
      if (id === '__proto__' || !id || id.length > MAX_ID || !o) return;
      const line: GroceryLine = {};
      if (o.got === true) line.got = true;
      const qty = cleanQty(o.qty); if (qty != null) line.qty = qty;
      const cents = cleanCents(o.cents); if (cents != null) line.cents = cents;
      if (Object.keys(line).length) lines[id] = line;
    });
  }
  const pulled = [...new Set((Array.isArray(raw.pulled) ? raw.pulled : []).filter((x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= MAX_ID))].slice(0, MAX_ITEMS);
  return { lines, pulled };
}
export const monthEmpty = (m: GroceryMonth) => !m.pulled.length && !Object.keys(m.lines).length;
