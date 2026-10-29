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

/** Ids the page already uses for its own elements (`groc-prev`, `groc-store-<id>`, `groc-more-<id>`, ...): an item id that starts with one would clash with them (audit U-9). */
const RESERVED_ID = /^(prev|next|month|summary|bought|skipall|alldone|money|h|edit|sharing|add|name|note|qty|price|unit|store|stores|more|done|spend|split|have|view|dock|home)(-|$)/;

/** An id for a new item: its name as a slug. A name whose slug is taken (here, or by a month line of a removed item) gets a short random suffix instead of -2, -3, so two
 *  devices that each add "Milk" for another store offline do not make the same id (audit G-5). Old ids stay valid as they are. */
export function newGroceryId(items: GroceryItem[], name: string, used: Iterable<string> = []): string {
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
  if (RESERVED_ID.test(base)) base = `item-${base}`.slice(0, 45);
  const taken = new Set([...items.map(i => i.id), ...used]); // `used`: ids that months still hold lines for (a removed item's), so a new item never inherits them
  let id = base;
  while (taken.has(id)) id = `${base}-${newShareId().slice(0, 4)}`;
  return id;
}

/** The sharing groups, cleaned: a store that is not in the list is dropped from a group, and a store defaults to one group only (the first). */
function normGroups(raw: unknown, stores: string[]): GroceryGroup[] {
  const groups: GroceryGroup[] = []; const ids = new Set<string>(); const taken = new Set<string>(); let everywhere = false;
  (Array.isArray(raw) ? raw : []).forEach((x: unknown) => {
    const g = normGroceryGroup(x);
    if (!g || ids.has(g.id) || groups.filter(x => !!x.gone === !!g.gone).length >= MAX_GROUPS) return; // up to MAX_GROUPS live groups, and as many again that are gone
    ids.add(g.id);
    const own = g.stores.filter(s => stores.includes(s) && !taken.has(s));
    own.forEach(s => taken.add(s));
    const { allStores, ...rest } = g; const keep = !!allStores && !g.gone && !everywhere; // the default for every store belongs to one live group: the first
    if (keep) everywhere = true;
    groups.push({ ...rest, stores: own, ...(keep ? { allStores: true as const } : {}) });
  });
  return groups;
}

/** A name that is also a property of every object (`__proto__`, `constructor`, `toString`, ...): as a store name it breaks the per-store maps (tax, payer, paid) that are keyed by it, so it is refused. */
export const isReservedName = (s: string): boolean => s in Object.prototype;
export const RESERVED_STORE = 'That name can’t be used for a store. Try another.';

export function normGrocery(d: unknown): Grocery {
  const raw = (d && typeof d === 'object' ? d : {}) as { stores?: unknown; items?: unknown; groups?: unknown; retired?: unknown };
  const seen = new Set<string>(); const items: GroceryItem[] = [];
  (Array.isArray(raw.items) ? raw.items : []).forEach((x: unknown) => {
    const item = normGroceryItem(x);
    if (!item || seen.has(item.id) || items.length >= MAX_ITEMS) return;
    seen.add(item.id);
    items.push(item);
  });
  const stores: string[] = [];
  const lower = (s: string) => s.toLowerCase();
  const addStore = (s: string) => { if (s && !isReservedName(s) && !stores.some(x => lower(x) === lower(s)) && stores.length < MAX_STORES) stores.push(s); }; // one store per name, whatever the case: the first spelling stays
  (Array.isArray(raw.stores) ? raw.stores : []).forEach((s: unknown) => addStore(str(s, 40)));
  const retired: string[] = []; // removed stores that history still names; never one that is live
  (Array.isArray(raw.retired) ? raw.retired : []).forEach((s: unknown) => { const n = str(s, 40); if (n && !isReservedName(n) && !stores.some(x => lower(x) === lower(n)) && !retired.some(x => lower(x) === lower(n)) && retired.length < MAX_STORES) retired.push(n); }); // a live store wins over a retired twin
  const isRetired = (s: string) => retired.some(x => lower(x) === lower(s));
  items.forEach(i => { if (!isRetired(i.store)) addStore(i.store); }); // an item naming a retired store leaves it retired (it stays a known name); only an unknown name adds a live store
  const canon = (s: string) => stores.find(x => lower(x) === lower(s)) ?? retired.find(x => lower(x) === lower(s)) ?? s; // an item typed 'aldi' belongs to 'Aldi'
  const groups = normGroups(raw.groups, stores);
  return { stores, items: items.map(i => (i.store ? (stores.includes(canon(i.store)) || retired.includes(canon(i.store)) ? { ...i, store: canon(i.store) } : { ...i, store: '' }) : i)), ...(groups.length ? { groups } : {}), ...(retired.length ? { retired } : {}) };
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

/** Whether you have an item this month: ticked "have" on At home, or bought (ticked on To get). A new month starts with the last month's ticks (ADR 079); before that, every month started unticked (ADR 054). */
export const haveOf = (item: GroceryItem, m: GroceryMonth) => { const l = lineOf(item, m); return l.have || l.got; };

/** The items on a month's list, in catalogue order. This month and later ones (`live`): everything you do not have yet, so a tick on At home takes one off
 *  (a new month starts with the last month's ticks, `carryOver`, ADR 079). A past month shows what was bought then (a ticked item, or one with its own
 *  count or price), not what is out today. */
export const onList = (g: Grocery, m: GroceryMonth, live: boolean) =>
  g.items.filter(i => {
    const l = m.lines[i.id];
    if (live) return !l?.have;
    return l?.got === true || l?.qty !== undefined || l?.cents !== undefined || m.pulled.includes(i.id);
  });

/** The At home ticks a new month starts with (ADR 079): the items you have (ticked Have, or bought) in the latest earlier month that has any, still in the catalogue.
 *  Null when the month was seeded before, already holds a Have tick of its own, or nothing earlier has a tick (a month with only purchases, bought ahead, is still seeded). Only ever asked for the current month. */
export function carryOver(g: Grocery, months: Record<string, GroceryMonth>, nowKey: string): { from: string; ids: string[] } | null {
  const cur = months[nowKey];
  if (cur?.carried || (cur && Object.values(cur.lines).some(l => l.have))) return null; // a Have tick is only made on the current month's At home list, so it means the month is already lived in
  const earlier = Object.keys(months).filter(k => MONTH_RE.test(k) && k < nowKey).sort().reverse();
  for (const from of earlier) {
    const ids = g.items.filter(i => haveOf(i, months[from]) && !cur?.lines[i.id]?.got).map(i => i.id); // an item already bought this month needs no tick
    if (ids.length) return { from, ids };
  }
  return null;
}

/** How many carried items are still ticked Have in a seeded month (the To get note); 0 when the month was not seeded. An item bought since is not counted. */
export const carriedCount = (g: Grocery, months: Record<string, GroceryMonth>, key: string) => {
  const m = months[key]; const from = m?.carried && months[m.carried];
  return m && from ? g.items.filter(i => haveOf(i, from) && lineOf(i, m).have).length : 0;
};

/** A store's items for the To get list: the ones still to get first, the ticked ones after them, each in catalogue order. */
export const gotLast = (items: GroceryItem[], m: GroceryMonth) => [...items.filter(i => !lineOf(i, m).got), ...items.filter(i => lineOf(i, m).got)];

/** Whether a store name still means something: a live store, or one that was removed while history uses it (retired). */
export const storeKnown = (g: Grocery, store: string): boolean => g.stores.includes(store) || !!g.retired?.includes(store);

/** The list split by store, in the order of `stores`; items with no store come last. Empty stores are left out. With `sharing` on, stores shared with a group of other people come first, then your own, and `group` is the group a shared store
 *  defaults to; with it off the order is plain, whatever groups the data holds. */
/** A value stored under a store's name (its tax or payer), or undefined. Only the map's own keys count: a store called "constructor" or "toString" must
 *  not find a function on the object's prototype. */
export const own = <T,>(map: Record<string, T> | undefined, key: string): T | undefined => map && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;

export function byStore(g: Grocery, items: GroceryItem[], sharing = false): { store: string; label: string; items: GroceryItem[]; group?: GroceryGroup }[] {
  const out = [...g.stores, ...(g.retired ?? [])].map(store => { // a retired store has a section only in a past month that still names it
    const live = (x: GroceryGroup) => x.people.some(p => !p.gone);
    const group = sharing ? g.groups?.find(x => live(x) && x.stores.includes(store)) ?? g.groups?.find(x => live(x) && x.allStores) : undefined; // the store's own group, else the one for all stores (as groupOfStore)
    return { store, label: store, items: items.filter(i => i.store === store), ...(group ? { group } : {}) };
  });
  const shared = out.filter(x => x.group);
  out.splice(0, out.length, ...shared, ...out.filter(x => !x.group));
  // An item whose store is not in the list (a store removed on another device while this one added to it, an import into a full list) would vanish from the
  // screens, so it is shown under Anywhere.
  out.push({ store: '', label: ANYWHERE, items: items.filter(i => !i.store || !storeKnown(g, i.store)) });
  return out.filter(x => x.items.length);
}

/** The store an item is bought at in a month: that month's own choice (Move to on To get) while that store still exists or is Anywhere, else the
 *  item's usual store. */
export function storeFor(g: Grocery, item: GroceryItem, m: GroceryMonth): string {
  const s = m.lines[item.id]?.store;
  const store = s !== undefined && (s === '' || storeKnown(g, s)) ? s : item.store;
  // An item whose own store is not in the list (removed on another device, an import into a full list) is under Anywhere, as byStore shows it, so the bills,
  // tax and shares count it there too.
  return store === '' || storeKnown(g, store) ? store : '';
}
/** The store a bought line of a removed item stays under: the one pinned on the line when the item was removed (so its bill and its store's tax stay), else Anywhere. */
export const removedStore = (g: Grocery, l: GroceryLine): string => (l.store !== undefined && storeKnown(g, l.store) ? l.store : '');
/** Stands in for an item that was removed, so its bought line is read like any other: no price of its own beyond the line's, the store it was pinned to. */
export const removedItem = (g: Grocery, id: string, l: GroceryLine): GroceryItem => ({ id, n: '', store: removedStore(g, l), qty: 1, cents: null, every: true, out: false });
/** The items as they sit in a month: each under the store it is bought at that month, so grouping, bills, tax and sharing all follow it. */
export const inMonth = (g: Grocery, items: GroceryItem[], m: GroceryMonth): GroceryItem[] =>
  items.map(i => { const store = storeFor(g, i, m); return store === i.store ? i : { ...i, store }; });

/** The bought lines of items that were removed from the list, read as items under the store they were bought at, so a month's tile, count and tax hint
 *  see the same purchases as the store lines, the split card and Spending do (`purchasesOf`, `spendByMonth`). */
export const removedBought = (g: Grocery, m: GroceryMonth): GroceryItem[] =>
  Object.entries(m.lines).filter(([id, l]) => l.got && !g.items.some(x => x.id === id)).map(([id, l]) => { const it = removedItem(g, id, l); return { ...it, store: storeFor(g, it, m) }; });

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
 *  A line for an item that could not be added is dropped rather than attached to the wrong item. A line for an item the file does not list at all (one removed
 *  after it was bought, whose purchase stays in its month) is kept under its own id when no item here has that id, so a backup added to other data keeps its history. */
export function mergeGrocery(cur: Grocery, curMonths: Record<string, GroceryMonth>, inc: GroceryData) {
  const g = structuredClone(cur); const months = structuredClone(curMonths); let changed = false;
  const map = new Map<string, string>(); // the file's item id -> the id here
  const listed = new Set(inc.items.map(i => i.id));
  // Ids that month lines here or in the file still use for items that are gone: a new item must not take one, or it would inherit those purchases.
  const keptIds = new Set([...Object.values(months).flatMap(m => Object.keys(m.lines)), ...Object.values(inc.months).flatMap(m => Object.keys(m.lines).filter(id => !listed.has(id)))]);
  // The stores go in first, so an item can be matched on the store it will have here: one whose store did not fit in a full list is kept under Anywhere (as
  // normGrocery would on the next load) and, importing the same file again, is matched there instead of being added a second time.
  // Store names compare without case, as the store actions do: 'aldi' in the file is the 'Aldi' here (the live spelling wins), so no twin is added (N-17a).
  const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const hereAs = (s: string) => g.stores.find(x => sameName(x, s)) ?? g.retired?.find(x => sameName(x, s));
  inc.stores.forEach(s => {
    if (isReservedName(s) || g.stores.some(x => sameName(x, s))) return;
    if (g.stores.length < MAX_STORES) { const back = g.retired?.find(x => sameName(x, s)); g.stores.push(back ?? s); if (back) { g.retired = g.retired!.filter(x => x !== back); if (!g.retired.length) delete g.retired; } changed = true; } // a retired twin comes back under the spelling it had
  });
  (inc.retired ?? []).forEach(s => { if (!isReservedName(s) && !hereAs(s) && (g.retired?.length ?? 0) < MAX_STORES) { g.retired = [...(g.retired ?? []), s]; changed = true; } }); // history in the file may name them
  inc.items.forEach(raw => {
    const here = raw.store ? g.stores.find(x => sameName(x, raw.store)) : undefined;
    const i = raw.store && !here ? { ...raw, store: '' } : here && here !== raw.store ? { ...raw, store: here } : raw;
    const same = g.items.find(x => x.n.toLowerCase() === i.n.toLowerCase() && x.store === i.store);
    if (same) { map.set(raw.id, same.id); return; }
    if (g.items.length >= MAX_ITEMS) return;
    const id = g.items.some(x => x.id === i.id) || keptIds.has(i.id) ? newGroceryId(g.items, i.n, keptIds) : i.id;
    g.items.push({ ...i, id }); map.set(raw.id, id); changed = true;
  });
  // A group is matched by its id (made at random, so the same group in a backup of this account has the same id here); one that is missing is
  // added, with the stores it names that exist here. People keep their ids, so an item's share in the file still points at them.
  const have = new Set((g.groups ?? []).map(x => x.id)); const defaulted = new Set((g.groups ?? []).flatMap(x => x.stores));
  (inc.groups ?? []).forEach(x => {
    if (have.has(x.id) || (g.groups ?? []).filter(y => !y.gone).length >= MAX_GROUPS) return;
    const stores = x.stores.filter(st => g.stores.includes(st) && !defaulted.has(st));
    stores.forEach(st => defaulted.add(st));
    const { allStores, ...rest } = x; const keep = !!allStores && !x.gone && !(g.groups ?? []).some(y => y.allStores && !y.gone); // one default for every store here
    g.groups = [...(g.groups ?? []), { ...rest, stores, ...(keep ? { allStores: true as const } : {}) }]; have.add(x.id); changed = true;
  });
  Object.entries(inc.months).forEach(([k, fm]) => {
    const lines: Record<string, GroceryLine> = {};
    Object.entries(fm.lines).forEach(([id, l]) => { const to = map.get(id); if (to) lines[to] = l; else if (!listed.has(id) && !g.items.some(x => x.id === id)) lines[id] = l; }); // a removed item's purchase keeps its own id
    const pulled = fm.pulled.map(id => map.get(id)).filter((x): x is string => !!x);
    const m: GroceryMonth = { lines, pulled: [...new Set(pulled)], ...(fm.payer ? { payer: fm.payer } : {}), ...(fm.tax ? { tax: fm.tax } : {}), ...(fm.paid ? { paid: fm.paid } : {}), ...(fm.carried ? { carried: fm.carried } : {}) };
    if (monthEmpty(m)) return;
    const have = months[k];
    if (!have) { months[k] = m; changed = true; return; }
    const mergedLines = { ...m.lines, ...have.lines }; const mergedPulled = [...new Set([...have.pulled, ...m.pulled])];
    const mergedPayer = { ...m.payer, ...have.payer }; const mergedTax = { ...m.tax, ...have.tax }; const mergedPaid = { ...m.paid, ...have.paid }; // what is here wins, per store (and per settled mark)
    if (JSON.stringify(mergedLines) !== JSON.stringify(have.lines) || mergedPulled.length !== have.pulled.length || Object.keys(mergedPayer).length !== Object.keys(have.payer ?? {}).length || Object.keys(mergedTax).length !== Object.keys(have.tax ?? {}).length || Object.keys(mergedPaid).length !== Object.keys(have.paid ?? {}).length || (!have.carried && m.carried)) {
      months[k] = { lines: mergedLines, pulled: mergedPulled, ...(Object.keys(mergedPayer).length ? { payer: mergedPayer } : {}), ...(Object.keys(mergedTax).length ? { tax: mergedTax } : {}), ...(Object.keys(mergedPaid).length ? { paid: mergedPaid } : {}), ...((have.carried ?? m.carried) ? { carried: have.carried ?? m.carried } : {}) }; changed = true;
    }
  });
  return { grocery: g, months, changed };
}

/** The store drop-down: your stores first, then the suggested ones you have not used yet. */
export function storeChoices(g: Grocery) {
  const have = new Set(g.stores.map(x => x.toLowerCase()));
  return { mine: g.stores, suggested: SUGGESTED_STORES.filter(x => !have.has(x.toLowerCase())) };
}
