import { str } from '../shared/stretchWeek.js';
import type { Grocery, GroceryData, GroceryItem, GroceryLine, GroceryMonth } from '../types.ts';

/* ---------- Grocery list ----------
   The catalogue (`grocery/main`) holds every item once: where you buy it, the usual count and the last unit price. A month
   (`grocery/YYYY-MM`) holds only what happened that month: ticks, counts and prices that differ. Each item is "Every month" (always
   on the list) or "When out" (on the current month's list only while it is out: unchecked on the At home list, ADR 038). A month
   with no saved document is the Every-month items plus whatever is out, nothing ticked, so each month starts fresh and nothing is
   copied or reset. Prices are whole cents, so totals never drift. */

export const MAX_ITEMS = 500, MAX_STORES = 30, MAX_QTY = 999, MAX_CENTS = 99_999_999;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const ANYWHERE = 'Anywhere';
/** Stores offered in the drop-downs before you have used them; picking one adds it to your stores. */
export const SUGGESTED_STORES = ["BJ's", 'C-Town', 'Whole Foods', 'Flatbush Co-Op', 'Aldi'];

export const emptyGrocery = (): Grocery => ({ stores: [], items: [] });
export const emptyMonth = (): GroceryMonth => ({ lines: {}, pulled: [] });

/* ---------- Months ---------- */
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + by, 1));
}
export const monthLabel = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

/* ---------- Cleaning saved or imported documents ---------- */
export const cleanQty = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_QTY ? Math.round(n * 100) / 100 : null;
};
export const cleanCents = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_CENTS ? v : null);

/** Dollars typed in a box ("3.49", "$3.5") to cents, or null when it is not a price. */
export function parseDollars(text: string): number | null {
  const t = text.trim().replace(/^\$/, '');
  if (!/^\d{1,6}(\.\d{0,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
export const centsText = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2));
export const money = (c: number) => (c / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export function newGroceryId(items: GroceryItem[], name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
  const taken = new Set(items.map(i => i.id)); let id = base, n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

export function normGrocery(d: unknown): Grocery {
  const raw = (d && typeof d === 'object' ? d : {}) as { stores?: unknown; items?: unknown };
  const seen = new Set<string>(); const items: GroceryItem[] = [];
  (Array.isArray(raw.items) ? raw.items : []).forEach((x: unknown) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const id = str(o.id, 60), n = str(o.n, 80);
    if (!id || !n || id === '__proto__' || seen.has(id) || items.length >= MAX_ITEMS) return;
    seen.add(id);
    // Older data has `once` (an occasional item) instead: it becomes a When-out item that is not out, which is how it behaved.
    const every = o.every === true || (o.every === undefined && o.once !== true);
    items.push({ id, n, store: str(o.store, 40), qty: cleanQty(o.qty) ?? 1, cents: cleanCents(o.cents), every, out: !every && o.out === true });
  });
  const stores: string[] = [];
  const addStore = (s: string) => { if (s && !stores.includes(s) && stores.length < MAX_STORES) stores.push(s); };
  (Array.isArray(raw.stores) ? raw.stores : []).forEach((s: unknown) => addStore(str(s, 40)));
  items.forEach(i => addStore(i.store));
  return { stores, items: items.map(i => (i.store && !stores.includes(i.store) ? { ...i, store: '' } : i)) };
}

export function normGroceryMonth(d: unknown): GroceryMonth {
  const raw = (d && typeof d === 'object' ? d : {}) as { lines?: unknown; pulled?: unknown };
  const lines: Record<string, GroceryLine> = {};
  if (raw.lines && typeof raw.lines === 'object') {
    Object.entries(raw.lines as Record<string, unknown>).slice(0, MAX_ITEMS).forEach(([id, v]) => {
      if (id === '__proto__' || id.length > 60 || !v || typeof v !== 'object') return;
      const o = v as Record<string, unknown>; const line: GroceryLine = {};
      if (o.got === true) line.got = true;
      const qty = cleanQty(o.qty); if (qty != null) line.qty = qty;
      const cents = cleanCents(o.cents); if (cents != null) line.cents = cents;
      if (Object.keys(line).length) lines[id] = line;
    });
  }
  const pulled = [...new Set((Array.isArray(raw.pulled) ? raw.pulled : []).filter((x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 60))].slice(0, MAX_ITEMS);
  return { lines, pulled };
}
export const monthEmpty = (m: GroceryMonth) => !m.pulled.length && !Object.keys(m.lines).length;

/* ---------- Reading a month ---------- */
/** An item as this month sees it: its count and unit price (the month's, else the catalogue's), and whether it is ticked. */
export function lineOf(item: GroceryItem, m: GroceryMonth) {
  const l = m.lines[item.id] || {};
  return { got: l.got === true, qty: l.qty ?? item.qty, cents: l.cents ?? item.cents };
}
export const lineTotal = (qty: number, cents: number | null) => (cents == null ? 0 : Math.round(qty * cents));

/** The items on this month's list, in catalogue order: the Every-month ones, anything ticked or pulled on (older data) that month,
 *  and, in the current month only, the When-out items that are out. A past month shows what was bought, not what is out today. */
export const onList = (g: Grocery, m: GroceryMonth, current: boolean) =>
  g.items.filter(i => i.every || m.lines[i.id]?.got === true || m.pulled.includes(i.id) || (current && i.out));

/** A store's items for the To get list: the ones still to get first, the ticked ones after them, each in catalogue order. */
export const gotLast = (items: GroceryItem[], m: GroceryMonth) => [...items.filter(i => !lineOf(i, m).got), ...items.filter(i => lineOf(i, m).got)];

/** The list split by store, in the order of `stores`; items with no store come last. Empty stores are left out. */
export function byStore(g: Grocery, items: GroceryItem[]): { store: string; label: string; items: GroceryItem[] }[] {
  const out = g.stores.map(store => ({ store, label: store, items: items.filter(i => i.store === store) }));
  out.push({ store: '', label: ANYWHERE, items: items.filter(i => !i.store) });
  return out.filter(x => x.items.length);
}

/** Counts and money for a set of items: how many are ticked, what the list is expected to cost, and what the ticked ones cost. */
export function tally(items: GroceryItem[], m: GroceryMonth) {
  let got = 0, planned = 0, spent = 0, unpriced = 0;
  items.forEach(i => {
    const l = lineOf(i, m); const t = lineTotal(l.qty, l.cents);
    planned += t; if (l.cents == null) unpriced++;
    if (l.got) { got++; spent += t; }
  });
  return { count: items.length, got, planned, spent, unpriced };
}

/* ---------- The data file and backups ---------- */
/** A data file's grocery part, cleaned; null when it holds nothing. */
export function normGroceryData(d: unknown): GroceryData | null {
  const raw = (d && typeof d === 'object' ? d : {}) as { months?: unknown };
  const g = normGrocery(d); const months: Record<string, GroceryMonth> = {};
  if (raw.months && typeof raw.months === 'object') {
    Object.entries(raw.months as Record<string, unknown>).forEach(([k, v]) => { if (MONTH_RE.test(k)) { const m = normGroceryMonth(v); if (!monthEmpty(m)) months[k] = m; } });
  }
  return g.items.length || g.stores.length || Object.keys(months).length ? { ...g, months } : null;
}

/** "Add to my data": the file's items and months are added to what is here; where both have something, what is here stays.
 *  Ids are made on each device, so one id can name different items in the file and here. An incoming item is matched to a local one by
 *  name and store; otherwise it is added (under a new id if its own is taken), and its month lines and pulled ids follow that mapping.
 *  A line for an item the file does not list, or one that could not be added, is dropped rather than attached to the wrong item. */
export function mergeGrocery(cur: Grocery, curMonths: Record<string, GroceryMonth>, inc: GroceryData) {
  const g = structuredClone(cur); const months = structuredClone(curMonths); let changed = false;
  const map = new Map<string, string>(); // the file's item id -> the id here
  inc.items.forEach(i => {
    const same = g.items.find(x => x.n.toLowerCase() === i.n.toLowerCase() && x.store === i.store);
    if (same) { map.set(i.id, same.id); return; }
    if (g.items.length >= MAX_ITEMS) return;
    const id = g.items.some(x => x.id === i.id) ? newGroceryId(g.items, i.n) : i.id;
    g.items.push({ ...i, id }); map.set(i.id, id); changed = true;
  });
  inc.stores.forEach(s => { if (!g.stores.includes(s) && g.stores.length < MAX_STORES) { g.stores.push(s); changed = true; } });
  Object.entries(inc.months).forEach(([k, fm]) => {
    const lines: Record<string, GroceryLine> = {};
    Object.entries(fm.lines).forEach(([id, l]) => { const to = map.get(id); if (to) lines[to] = l; });
    const pulled = fm.pulled.map(id => map.get(id)).filter((x): x is string => !!x);
    const m: GroceryMonth = { lines, pulled: [...new Set(pulled)] };
    if (monthEmpty(m)) return;
    const have = months[k];
    if (!have) { months[k] = m; changed = true; return; }
    const mergedLines = { ...m.lines, ...have.lines }; const mergedPulled = [...new Set([...have.pulled, ...m.pulled])];
    if (JSON.stringify(mergedLines) !== JSON.stringify(have.lines) || mergedPulled.length !== have.pulled.length) { months[k] = { lines: mergedLines, pulled: mergedPulled }; changed = true; }
  });
  return { grocery: g, months, changed };
}

/** The store drop-down: your stores first, then the suggested ones you have not used yet. */
export function storeChoices(g: Grocery) {
  const have = new Set(g.stores.map(x => x.toLowerCase()));
  return { mine: g.stores, suggested: SUGGESTED_STORES.filter(x => !have.has(x.toLowerCase())) };
}
