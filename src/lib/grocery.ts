import { MAX_GROUPS, MAX_ITEMS, MAX_PRICES, MAX_STORES, MONTH_RE, monthEmpty, normGroceryGroup, normGroceryItem, normGroceryMonth } from '../shared/grocery.js';
import { str } from '../shared/stretchWeek.js';
import type { Grocery, GroceryData, GroceryGroup, GroceryItem, GroceryLine, GroceryMonth, GroceryUnit } from '../types.ts';

/* ---------- Grocery list ----------
   The catalogue (`grocery/main`) holds every item once: where you buy it, the usual count and the last unit price. A month
   (`grocery/YYYY-MM`) holds only what happened that month: ticks, counts and prices that differ. Each item is "Every month" (always
   on the list) or "When out"; since ADR 054 the two behave the same: every item is on each month's list until you have it. A month
   (`grocery/YYYY-MM`) holds what happened that month: `have` (ticked on At home, so off the list), `got` (bought), counts and prices.
   A month with no saved document has nothing ticked, so each month starts fresh with every item on it and nothing is copied or reset.
   Prices are whole cents, so totals never drift. The cleaning rules live in shared/grocery.ts, which the API uses too. */

export { paidKey } from '../shared/grocery.js';
export { MAX_CENTS, MAX_GROUPS, MAX_ITEMS, MAX_NOTE, MAX_PEOPLE, MAX_PERSON, MAX_PRICES, MAX_QTY, MAX_STORES, MONTH_RE, UNITS, cleanCents, cleanPrices, cleanQty, emptyMonth, monthEmpty, normGroceryMonth } from '../shared/grocery.js';
export const ANYWHERE = 'Anywhere';
/** Stores offered in the drop-downs before you have used them; picking one adds it to your stores. */
export const SUGGESTED_STORES = ["BJ's", 'C-Town', 'Whole Foods', 'Flatbush Co-Op', 'Aldi'];

export const emptyGrocery = (): Grocery => ({ stores: [], items: [] });

/* ---------- Months ---------- */
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + by, 1));
}
export const monthLabel = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

/* ---------- Cleaning saved or imported documents ---------- */
/** Dollars typed in a box ("3.49", "$3.5") to cents, or null when it is not a price. */
export function parseDollars(text: string): number | null {
  const t = text.trim().replace(/^\$/, '');
  if (!/^\d{1,6}(\.\d{0,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
export const centsText = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2));
export const money = (c: number) => (c / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

/** An id for a person or a group: random, so a group in a backup or on another device never clashes with one made here. */
export function newShareId(): string {
  const b = new Uint8Array(6); crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

export function newGroceryId(items: GroceryItem[], name: string, used: Iterable<string> = []): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
  const taken = new Set([...items.map(i => i.id), ...used]); let id = base, n = 2; // `used`: ids that months still hold lines for (a removed item's), so a new item never inherits them
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

/** The sharing groups, cleaned: a store that is not in the list is dropped from a group, and a store defaults to one group only (the first). */
function normGroups(raw: unknown, stores: string[]): GroceryGroup[] {
  const groups: GroceryGroup[] = []; const ids = new Set<string>(); const taken = new Set<string>();
  (Array.isArray(raw) ? raw : []).forEach((x: unknown) => {
    const g = normGroceryGroup(x);
    if (!g || ids.has(g.id) || groups.filter(x => !!x.gone === !!g.gone).length >= MAX_GROUPS) return; // up to MAX_GROUPS live groups, and as many again that are gone
    ids.add(g.id);
    const own = g.stores.filter(s => stores.includes(s) && !taken.has(s));
    own.forEach(s => taken.add(s));
    groups.push({ ...g, stores: own });
  });
  return groups;
}

export function normGrocery(d: unknown): Grocery {
  const raw = (d && typeof d === 'object' ? d : {}) as { stores?: unknown; items?: unknown; groups?: unknown };
  const seen = new Set<string>(); const items: GroceryItem[] = [];
  (Array.isArray(raw.items) ? raw.items : []).forEach((x: unknown) => {
    const item = normGroceryItem(x);
    if (!item || seen.has(item.id) || items.length >= MAX_ITEMS) return;
    seen.add(item.id);
    items.push(item);
  });
  const stores: string[] = [];
  const addStore = (s: string) => { if (s && !stores.includes(s) && stores.length < MAX_STORES) stores.push(s); };
  (Array.isArray(raw.stores) ? raw.stores : []).forEach((s: unknown) => addStore(str(s, 40)));
  items.forEach(i => addStore(i.store));
  const groups = normGroups(raw.groups, stores);
  return { stores, items: items.map(i => (i.store && !stores.includes(i.store) ? { ...i, store: '' } : i)), ...(groups.length ? { groups } : {}) };
}

/* ---------- Reading a month ---------- */
/** An item as this month sees it: its count and unit price (the month's, else the catalogue's), and whether it is ticked. */
export function lineOf(item: GroceryItem, m: GroceryMonth) {
  const l = m.lines[item.id] || {};
  const prices = l.prices?.length ? l.prices : undefined; // priced one by one: the count is how many, the total their sum
  return { got: l.got === true, have: l.have === true, qty: prices ? prices.length : l.qty ?? item.qty, cents: l.cents ?? (l.unpriced ? null : item.cents), prices }; // bought with no price stays unpriced
}
/** The words around a count and a price: by weight (lb, kg, oz) the count is a weight and the price is per unit; otherwise each. */
export const unitWords = (unit?: GroceryUnit) => ({
  count: unit ? `Weight (${unit})` : 'Count',
  price: unit ? `Price per ${unit}` : 'Price each',
  per: unit ? `/${unit}` : '',
  qty: (q: number) => (unit ? `${q} ${unit}` : String(q)),
});
export const lineTotal = (qty: number, cents: number | null) => (cents == null ? 0 : Math.round(qty * cents));
/** What a line costs: the sum of its own prices when it has them, else its count times its price. */
export const lineCost = (l: { qty: number; cents: number | null; prices?: number[] }) => (l.prices ? l.prices.reduce((a, c) => a + c, 0) : lineTotal(l.qty, l.cents));
/** Prices typed in one box ("8.99, 10.49 9.25") to cents; null when any of them is not a price or there are none or too many. */
export function parsePrices(text: string): number[] | null {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (!parts.length || parts.length > MAX_PRICES) return null;
  const out = parts.map(parseDollars);
  return out.every((c): c is number => c != null) ? out : null;
}

/** Whether you have an item this month: ticked "have" on At home, or bought (ticked on To get). It starts every month unticked (ADR 054). */
export const haveOf = (item: GroceryItem, m: GroceryMonth) => { const l = lineOf(item, m); return l.have || l.got; };

/** The items on a month's list, in catalogue order. This month and later ones (`live`): everything you do not have yet, so each month starts
 *  with every item on it and a tick on At home takes one off. A past month shows what was bought then (a ticked item, or one with its own
 *  count or price), not what is out today. */
export const onList = (g: Grocery, m: GroceryMonth, live: boolean) =>
  g.items.filter(i => {
    const l = m.lines[i.id];
    if (live) return !l?.have;
    return l?.got === true || l?.qty !== undefined || l?.cents !== undefined || m.pulled.includes(i.id);
  });

/** A store's items for the To get list: the ones still to get first, the ticked ones after them, each in catalogue order. */
export const gotLast = (items: GroceryItem[], m: GroceryMonth) => [...items.filter(i => !lineOf(i, m).got), ...items.filter(i => lineOf(i, m).got)];

/** The list split by store, in the order of `stores`; items with no store come last. Empty stores are left out. With `sharing` on, stores shared with a group of other people come first, then your own, and `group` is the group a shared store
 *  defaults to; with it off the order is plain, whatever groups the data holds. */
/** A value stored under a store's name (its tax or payer), or undefined. Only the map's own keys count: a store called "constructor" or "toString" must
 *  not find a function on the object's prototype. */
export const own = <T,>(map: Record<string, T> | undefined, key: string): T | undefined => map && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;

export function byStore(g: Grocery, items: GroceryItem[], sharing = false): { store: string; label: string; items: GroceryItem[]; group?: GroceryGroup }[] {
  const out = g.stores.map(store => {
    const group = sharing ? g.groups?.find(x => x.people.some(p => !p.gone) && x.stores.includes(store)) : undefined;
    return { store, label: store, items: items.filter(i => i.store === store), ...(group ? { group } : {}) };
  });
  const shared = out.filter(x => x.group);
  out.splice(0, out.length, ...shared, ...out.filter(x => !x.group));
  // An item whose store is not in the list (a store removed on another device while this one added to it, an import into a full list) would vanish from the
  // screens, so it is shown under Anywhere.
  out.push({ store: '', label: ANYWHERE, items: items.filter(i => !i.store || !g.stores.includes(i.store)) });
  return out.filter(x => x.items.length);
}

/** The store an item is bought at in a month: that month's own choice (Move to on To get) while that store still exists or is Anywhere, else the
 *  item's usual store. */
export function storeFor(g: Grocery, item: GroceryItem, m: GroceryMonth): string {
  const s = m.lines[item.id]?.store;
  const store = s !== undefined && (s === '' || g.stores.includes(s)) ? s : item.store;
  // An item whose own store is not in the list (removed on another device, an import into a full list) is under Anywhere, as byStore shows it, so the bills,
  // tax and shares count it there too.
  return store === '' || g.stores.includes(store) ? store : '';
}
/** The store a bought line of a removed item stays under: the one pinned on the line when the item was removed (so its bill and its store's tax stay), else Anywhere. */
export const removedStore = (g: Grocery, l: GroceryLine): string => (l.store !== undefined && g.stores.includes(l.store) ? l.store : '');
/** Stands in for an item that was removed, so its bought line is read like any other: no price of its own beyond the line's, the store it was pinned to. */
export const removedItem = (g: Grocery, id: string, l: GroceryLine): GroceryItem => ({ id, n: '', store: removedStore(g, l), qty: 1, cents: null, every: true, out: false });
/** The items as they sit in a month: each under the store it is bought at that month, so grouping, bills, tax and sharing all follow it. */
export const inMonth = (g: Grocery, items: GroceryItem[], m: GroceryMonth): GroceryItem[] =>
  items.map(i => { const store = storeFor(g, i, m); return store === i.store ? i : { ...i, store }; });

/** The words after a shared store's name: its group and how many others are in it ("Home +2"). */
export const groupTag = (group: GroceryGroup) => `${group.n} +${group.people.filter(p => !p.gone).length}`;

/** Counts and money for a set of items: how many are ticked, what the list is expected to cost, and what the ticked ones cost. `spent` adds the
 *  month's tax for each store that has something ticked here (the receipt's tax, typed in); `planned` is what the prices come to before tax. */
export function tally(items: GroceryItem[], m: GroceryMonth) {
  let got = 0, planned = 0, spent = 0, unpriced = 0;
  const boughtAt = new Set<string>();
  items.forEach(i => {
    const l = lineOf(i, m); const t = lineCost(l);
    planned += t; if (l.cents == null && !l.prices) unpriced++;
    if (l.got) { got++; spent += t; boughtAt.add(i.store); }
  });
  let taxed = false; // whether any tax was added: only a store with something ticked counts
  boughtAt.forEach(store => { const t = own(m.tax, store) ?? 0; if (t) { spent += t; taxed = true; } });
  return { count: items.length, got, planned, spent, unpriced, taxed };
}

/** What was bought each month: the ticked lines' count × price plus each store's tax from the receipt, for the `count` months ending at `endKey` (oldest first). A line keeps the
 *  price it was ticked at; one with no price of its own uses the item's, and a line for a removed item uses only its own. */
export function spendByMonth(g: Grocery, months: Record<string, GroceryMonth>, endKey: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const key = shiftMonth(endKey, i - count + 1); const m = months[key];
    let spent = 0, bought = 0; const boughtAt = new Set<string>();
    Object.entries(m?.lines ?? {}).forEach(([id, l]) => {
      if (!l.got) return;
      const it = g.items.find(x => x.id === id);
      bought++; boughtAt.add(storeFor(g, it ?? removedItem(g, id, l), m!)); spent += l.prices?.length ? lineCost({ qty: l.prices.length, cents: null, prices: l.prices }) : lineTotal(l.qty ?? it?.qty ?? 1, l.cents ?? (l.unpriced ? null : it?.cents ?? null));
    });
    boughtAt.forEach(store => { spent += own(m?.tax, store) ?? 0; }); // each store's tax from the receipt
    return { key, spent, bought };
  });
}

/* ---------- The data file and backups ---------- */
/** A data file's grocery part, cleaned; null when it holds nothing. */
export function normGroceryData(d: unknown): GroceryData | null {
  const raw = (d && typeof d === 'object' ? d : {}) as { months?: unknown };
  const g = normGrocery(d); const months: Record<string, GroceryMonth> = {};
  if (raw.months && typeof raw.months === 'object') {
    Object.entries(raw.months as Record<string, unknown>).forEach(([k, v]) => { if (MONTH_RE.test(k)) { const m = normGroceryMonth(v); if (!monthEmpty(m)) months[k] = m; } });
  }
  return g.items.length || g.stores.length || g.groups?.length || Object.keys(months).length ? { ...g, months } : null;
}

/** "Add to my data": the file's items and months are added to what is here; where both have something, what is here stays.
 *  Ids are made on each device, so one id can name different items in the file and here. An incoming item is matched to a local one by
 *  name and store; otherwise it is added (under a new id if its own is taken), and its month lines and pulled ids follow that mapping.
 *  A line for an item the file does not list, or one that could not be added, is dropped rather than attached to the wrong item. */
export function mergeGrocery(cur: Grocery, curMonths: Record<string, GroceryMonth>, inc: GroceryData) {
  const g = structuredClone(cur); const months = structuredClone(curMonths); let changed = false;
  const map = new Map<string, string>(); // the file's item id -> the id here
  // The stores go in first, so an item can be matched on the store it will have here: one whose store did not fit in a full list is kept under Anywhere (as
  // normGrocery would on the next load) and, importing the same file again, is matched there instead of being added a second time.
  inc.stores.forEach(s => { if (!g.stores.includes(s) && g.stores.length < MAX_STORES) { g.stores.push(s); changed = true; } });
  inc.items.forEach(raw => {
    const i = raw.store && !g.stores.includes(raw.store) ? { ...raw, store: '' } : raw;
    const same = g.items.find(x => x.n.toLowerCase() === i.n.toLowerCase() && x.store === i.store);
    if (same) { map.set(raw.id, same.id); return; }
    if (g.items.length >= MAX_ITEMS) return;
    const id = g.items.some(x => x.id === i.id) ? newGroceryId(g.items, i.n) : i.id;
    g.items.push({ ...i, id }); map.set(raw.id, id); changed = true;
  });
  // A group is matched by its id (made at random, so the same group in a backup of this account has the same id here); one that is missing is
  // added, with the stores it names that exist here. People keep their ids, so an item's share in the file still points at them.
  const have = new Set((g.groups ?? []).map(x => x.id)); const defaulted = new Set((g.groups ?? []).flatMap(x => x.stores));
  (inc.groups ?? []).forEach(x => {
    if (have.has(x.id) || (g.groups ?? []).filter(y => !y.gone).length >= MAX_GROUPS) return;
    const stores = x.stores.filter(st => g.stores.includes(st) && !defaulted.has(st));
    stores.forEach(st => defaulted.add(st));
    g.groups = [...(g.groups ?? []), { ...x, stores }]; have.add(x.id); changed = true;
  });
  Object.entries(inc.months).forEach(([k, fm]) => {
    const lines: Record<string, GroceryLine> = {};
    Object.entries(fm.lines).forEach(([id, l]) => { const to = map.get(id); if (to) lines[to] = l; });
    const pulled = fm.pulled.map(id => map.get(id)).filter((x): x is string => !!x);
    const m: GroceryMonth = { lines, pulled: [...new Set(pulled)], ...(fm.payer ? { payer: fm.payer } : {}), ...(fm.tax ? { tax: fm.tax } : {}), ...(fm.paid ? { paid: fm.paid } : {}) };
    if (monthEmpty(m)) return;
    const have = months[k];
    if (!have) { months[k] = m; changed = true; return; }
    const mergedLines = { ...m.lines, ...have.lines }; const mergedPulled = [...new Set([...have.pulled, ...m.pulled])];
    const mergedPayer = { ...m.payer, ...have.payer }; const mergedTax = { ...m.tax, ...have.tax }; const mergedPaid = { ...m.paid, ...have.paid }; // what is here wins, per store (and per settled mark)
    if (JSON.stringify(mergedLines) !== JSON.stringify(have.lines) || mergedPulled.length !== have.pulled.length || Object.keys(mergedPayer).length !== Object.keys(have.payer ?? {}).length || Object.keys(mergedTax).length !== Object.keys(have.tax ?? {}).length || Object.keys(mergedPaid).length !== Object.keys(have.paid ?? {}).length) {
      months[k] = { lines: mergedLines, pulled: mergedPulled, ...(Object.keys(mergedPayer).length ? { payer: mergedPayer } : {}), ...(Object.keys(mergedTax).length ? { tax: mergedTax } : {}), ...(Object.keys(mergedPaid).length ? { paid: mergedPaid } : {}) }; changed = true;
    }
  });
  return { grocery: g, months, changed };
}

/** The store drop-down: your stores first, then the suggested ones you have not used yet. */
export function storeChoices(g: Grocery) {
  const have = new Set(g.stores.map(x => x.toLowerCase()));
  return { mine: g.stores, suggested: SUGGESTED_STORES.filter(x => !have.has(x.toLowerCase())) };
}
