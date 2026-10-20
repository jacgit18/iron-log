import type { GroceryGroup, GroceryItem, GroceryLine, GroceryMonth, GroceryPerson, GroceryShare, GroceryStore, GroceryUnit } from '../types.ts';
import { str } from './stretchWeek.js';

/* ---------- Grocery list shapes: one item, one store, one month ----------
   The cleaning rules for the grocery list, shared by the app and the API (ADR 015), so the server holds what the app would.
   The cleaners take anything and return the clean value (or null when it can't be used); the `valid*` checks are stricter and
   say whether a value is already clean, for the API to refuse what the app would never send (ADR 039). */

export const MAX_ITEMS = 500, MAX_STORES = 30, MAX_QTY = 999, MAX_CENTS = 99_999_999, MAX_PRICES = 50;
/** A store's sales tax is a whole number of thousandths of a percent (8.875% is 8875), from 0.001% to 30%. */
export const MAX_TAX = 30_000;
export const cleanTax = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_TAX ? v : null);
export const MAX_ID = 60, MAX_NAME = 80, MAX_STORE = 40, MAX_NOTE = 120;
export const MAX_GROUPS = 10, MAX_PEOPLE = 10, MAX_PERSON = 40;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const UNITS: readonly GroceryUnit[] = ['kg', 'lb', 'oz'];
const cleanUnit = (v: unknown): GroceryUnit | null => UNITS.find(u => u === v) ?? null;

export const emptyMonth = (): GroceryMonth => ({ lines: {}, pulled: [] });

export const cleanQty = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_QTY ? Math.round(n * 100) / 100 : null;
};
export const cleanCents = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_CENTS ? v : null);

/** A list of prices in whole cents (1 to MAX_PRICES of them), or null when it is not one. */
export const cleanPrices = (v: unknown): number[] | null => {
  if (!Array.isArray(v) || !v.length || v.length > MAX_PRICES) return null;
  const out = v.map(cleanCents);
  return out.every((c): c is number => c != null) ? out : null;
};

const asObject = (x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);

/** Who shares one purchase with you (the people's ids; none = just you), or null when it is not one. `notMine` is kept only when there is
 *  someone for it to be for. */
export function cleanShare(v: unknown): GroceryShare | null {
  const o = asObject(v);
  if (!o || !Array.isArray(o.with)) return null;
  const ids = [...new Set(o.with.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= MAX_ID && x !== '__proto__'))].slice(0, MAX_PEOPLE);
  return ids.length && o.notMine === true ? { with: ids, notMine: true } : { with: ids };
}
/** Whether `v` is a share exactly as the app writes one (the API refuses anything else). */
export function validShare(v: unknown): v is GroceryShare {
  const c = cleanShare(v); const o = asObject(v);
  return !!c && !!o && Object.keys(o).every(k => k === 'with' || k === 'notMine') && c.with.length === (o.with as unknown[]).length && c.with.every((id, i) => id === (o.with as unknown[])[i]) && c.notMine === o.notMine;
}

/** One catalogue item, cleaned. Older data has `once` (an occasional item) instead of `every`: it becomes a When-out item that is
 *  not out, which is how it behaved (ADR 038). */
export function normGroceryItem(x: unknown): GroceryItem | null {
  const o = asObject(x);
  if (!o) return null;
  const id = str(o.id, MAX_ID), n = str(o.n, MAX_NAME);
  if (!id || !n || id === '__proto__') return null;
  const every = o.every === true || (o.every === undefined && o.once !== true);
  const qty = cleanQty(o.qty);
  const note = str(o.note, MAX_NOTE); const unit = cleanUnit(o.unit); const share = cleanShare(o.share);
  return { id, n, store: str(o.store, MAX_STORE), qty: qty && qty > 0 ? qty : 1, cents: cleanCents(o.cents), every, out: !every && o.out === true, ...(note ? { note } : {}), ...(unit ? { unit } : {}), ...(share ? { share } : {}) };
}

/** One store, as a row of its own: the name is its id. */
export function normGroceryStore(x: unknown): GroceryStore | null {
  const o = asObject(x);
  const n = o ? str(o.n ?? o.id, MAX_STORE) : '';
  const tax = o ? cleanTax(o.tax) : null;
  return n && n !== '__proto__' ? { id: n, n, ...(tax ? { tax } : {}) } : null;
}

const exact = (v: unknown, max: number, allowEmpty = false) => typeof v === 'string' && v === v.trim() && v.length <= max && (allowEmpty || v.length > 0);

/** One sharing group, cleaned: people and stores are capped and de-duplicated. */
export function normGroceryGroup(x: unknown): GroceryGroup | null {
  const o = asObject(x);
  if (!o) return null;
  const id = str(o.id, MAX_ID), n = str(o.n, MAX_PERSON);
  if (!id || !n || id === '__proto__') return null;
  const seen = new Set<string>(); const people: GroceryPerson[] = [];
  (Array.isArray(o.people) ? o.people : []).forEach((p: unknown) => {
    const po = asObject(p); const pid = po ? str(po.id, MAX_ID) : ''; const pn = po ? str(po.n, MAX_PERSON) : '';
    if (!po || !pid || !pn || pid === '__proto__' || pid === 'me' || seen.has(pid) || people.length >= MAX_PEOPLE) return;
    seen.add(pid); people.push({ id: pid, n: pn, ...(po.covered === true ? { covered: true as const } : {}) });
  });
  const stores = [...new Set((Array.isArray(o.stores) ? o.stores : []).map((s: unknown) => str(s, MAX_STORE)).filter(Boolean))].slice(0, MAX_STORES);
  return { id, n, people, stores };
}

/** True when `x` is a group exactly as the app writes one. */
export function validGroceryGroup(x: unknown): x is GroceryGroup {
  const o = asObject(x);
  if (!o || !exact(o.id, MAX_ID) || o.id === '__proto__' || !exact(o.n, MAX_PERSON)) return false;
  if (!Array.isArray(o.people) || o.people.length > MAX_PEOPLE || !Array.isArray(o.stores) || o.stores.length > MAX_STORES) return false;
  const ids = new Set<string>();
  for (const p of o.people) {
    const po = asObject(p);
    if (!po || !exact(po.id, MAX_ID) || po.id === '__proto__' || po.id === 'me' || ids.has(po.id as string) || !exact(po.n, MAX_PERSON) || (po.covered !== undefined && po.covered !== true)) return false;
    ids.add(po.id as string);
  }
  return o.stores.every((s: unknown) => exact(s, MAX_STORE)) && new Set(o.stores).size === o.stores.length;
}

/** True when `x` is a catalogue item exactly as the app writes one: names within their lengths, a count from 0.01 to 999, a price in whole
 *  cents or none, and the two mode flags. The API refuses anything else rather than cleaning it into something the user never typed. */
export function validGroceryItem(x: unknown): x is GroceryItem {
  const o = asObject(x);
  if (!o || !exact(o.id, MAX_ID) || o.id === '__proto__' || !exact(o.n, MAX_NAME) || !exact(o.store, MAX_STORE, true)) return false;
  if (typeof o.qty !== 'number' || cleanQty(o.qty) !== o.qty || o.qty <= 0) return false;
  if (o.cents !== null && cleanCents(o.cents) === null) return false;
  if (o.note !== undefined && !exact(o.note, MAX_NOTE)) return false;
  if (o.unit !== undefined && cleanUnit(o.unit) === null) return false;
  if (o.share !== undefined && !validShare(o.share)) return false;
  if (typeof o.every !== 'boolean' || typeof o.out !== 'boolean' || (o.every && o.out)) return false;
  return true;
}

export function validGroceryStore(x: unknown): x is GroceryStore {
  const o = asObject(x);
  return !!o && exact(o.n, MAX_STORE) && o.id === o.n && o.n !== '__proto__' && (o.tax === undefined || cleanTax(o.tax) === o.tax);
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
      if (o.have === true && !line.got) line.have = true;
      const qty = cleanQty(o.qty); if (qty != null) line.qty = qty;
      const cents = cleanCents(o.cents); if (cents != null) line.cents = cents;
      const prices = cleanPrices(o.prices); if (prices) line.prices = prices;
      const share = cleanShare(o.share); if (share) line.share = share;
      if (prices && Array.isArray(o.packShares)) { // one share per pack, kept in step with the prices; null is the line's own
        const ps = prices.map((_, i) => (o.packShares as unknown[])[i] == null ? null : cleanShare((o.packShares as unknown[])[i]));
        if (ps.some(Boolean)) line.packShares = ps;
      }
      if (Object.keys(line).length) lines[id] = line;
    });
  }
  const pulled = [...new Set((Array.isArray(raw.pulled) ? raw.pulled : []).filter((x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= MAX_ID))].slice(0, MAX_ITEMS);
  const payer: Record<string, string> = {}; // who paid for each store this month (a person's id); no entry = you
  Object.entries(asObject(raw.payer) ?? {}).slice(0, MAX_STORES).forEach(([store, id]) => {
    if (store !== '__proto__' && store.length <= MAX_STORE && typeof id === 'string' && id.length > 0 && id.length <= MAX_ID && id !== 'me') payer[store] = id;
  });
  return { lines, pulled, ...(Object.keys(payer).length ? { payer } : {}) };
}
export const monthEmpty = (m: GroceryMonth) => !m.pulled.length && !Object.keys(m.lines).length && !Object.keys(m.payer ?? {}).length;
