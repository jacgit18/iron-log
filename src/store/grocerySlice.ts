import * as settle from '../lib/grocerySettle.js';
import { ME as SELF } from '../lib/grocerySplit.js';
import { LS } from '../lib/storage.js';
import {
  MAX_GROUPS, MAX_ITEMS, MAX_NOTE, MAX_PEOPLE, MAX_PERSON, MAX_STORES, MONTH_RE, UNITS, cleanCents, cleanPrices, cleanQty, emptyMonth, lineOf, mergeGrocery, monthEmpty, monthKey, newGroceryId, newShareId, normGrocery, normGroceryData, onList, own, parseDollars, storeFor,
} from '../lib/grocery.js';
import { cleanShare } from '../shared/grocery.js';
import { storeStatus } from '../lib/grocerySettle.js';
import type { Grocery, GroceryData, GroceryItem, GroceryLine, GroceryMonth, GroceryShare } from '../types.ts';
import type { GrocerySlice, StoreGet, StoreSet } from './types.ts';
import { activePeople, knownPeople, partiesFor } from '../lib/grocerySettle.js';
import { ME } from '../lib/grocerySplit.js';

// The grocery list is the account's, like the rest of the data (ADR 039, replacing ADR 019's device-only list): it is saved through the
// same path as every other document (saveDoc / removeDoc), so with syncing on it goes to the server (grocery/main as list rows,
// grocery/YYYY-MM as one row per month) and with syncing off it stays in this browser's storage, as everything does then.
// It is in the data file and the backups.
const MAIN = 'grocery/main';
const monthPath = (key: string) => 'grocery/' + key;

/** The grocery list this browser holds in its own storage: the whole list with syncing off, and the copy from before the list synced
 *  (ADR 019) with it on. Null when there is none. */
export function deviceGrocery(): GroceryData | null {
  const months: Record<string, GroceryMonth> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('ironlog:grocery/')) continue;
      const key = k.slice('ironlog:grocery/'.length);
      if (MONTH_RE.test(key)) months[key] = LS.get(monthPath(key));
    }
  } catch { /* storage unavailable: nothing here */ }
  return normGroceryData({ ...(LS.get(MAIN) || {}), months });
}

// `flag` (the save-status helper) is not needed here: the save queue says when storage is full or a write was refused.
export const grocerySlice = (set: StoreSet, get: StoreGet): GrocerySlice => {
  const saveMain = (g: Grocery) => get().saveDoc(MAIN, g);
  const saveMonth = (key: string, m: GroceryMonth) => {
    if (monthEmpty(m)) get().removeDoc(monthPath(key)); // an untouched month is the fresh list: nothing to keep
    else get().saveDoc(monthPath(key), m);
  };
  // A store typed in another case ("aldi") is the store you already have ("Aldi"), as addGroceryStore treats it.
  const sameStore = (g: Grocery, store: string) => [...g.stores, ...(g.retired ?? [])].find(x => x.toLowerCase() === store.toLowerCase()) ?? store;
  // Makes a store live: a retired one of that name comes back (its past months read the same), a new one is added. Returns an error when the list is full.
  const ensureStore = (g: Grocery, store: string): string | null => {
    if (!store || g.stores.includes(store)) return null;
    if (g.stores.length >= MAX_STORES) return `Too many stores (${MAX_STORES}).`;
    g.stores.push(store);
    if (g.retired?.includes(store)) { g.retired = g.retired.filter(x => x !== store); if (!g.retired.length) delete g.retired; }
    return null;
  };
  // Whether any past month still leans on a store: a bought line pinned to it, its tax, or who paid there.
  const historyUses = (name: string) => Object.values(get().groceryMonths).some(m => Object.values(m.lines).some(l => l.got && l.store === name) || own(m.tax, name) !== undefined || own(m.payer, name) !== undefined);
  const mutateCatalogue = (fn: (g: Grocery) => string | null): string | null => {
    if (get().blocked()) return 'Still loading your data…';
    const g = structuredClone(get().grocery);
    const err = fn(g);
    if (err) return err;
    set({ grocery: g }); saveMain(g); return null;
  };
  const mutateMonth = (key: string, fn: (m: GroceryMonth) => void) => {
    if (!MONTH_RE.test(key) || get().blocked()) return;
    const m = structuredClone(get().groceryMonths[key] || emptyMonth());
    fn(m);
    const months = { ...get().groceryMonths };
    if (monthEmpty(m)) delete months[key]; else months[key] = m;
    set({ groceryMonths: months }); saveMonth(key, m);
  };

  // Before the people or the groups change, every bought line of an earlier month that has no split of its own is pinned to the split it was counted with
  // (the item's, else the store group's people, else just you), so adding or removing a person, or changing which group a store splits with, never rewrites
  // a month already bought (code audit M-05, and G-2 of the overnight audit). The month being lived in is left to follow the change.
  const pinPastParties = () => {
    const g = get().grocery; if (!g.groups?.length) return;
    const now = monthKey(new Date());
    Object.entries(get().groceryMonths).forEach(([key, m]) => {
      if (key >= now) return;
      const pins: Record<string, GroceryShare> = {};
      Object.entries(m.lines).forEach(([id, raw]) => {
        const item = g.items.find(i => i.id === id);
        if (!raw.got || raw.share || !item) return; // a removed item's line is pinned when it is removed
        const at = storeFor(g, item, m);
        pins[id] = shareOf(partiesFor(g, at === item.store ? item : { ...item, store: at }, raw));
      });
      if (Object.keys(pins).length) mutateMonth(key, mm => { Object.entries(pins).forEach(([id, share]) => { mm.lines[id] = { ...mm.lines[id], share }; }); });
    });
  };

  // A split as the parties it came to (you included unless it was for others only): the form a line keeps when it is pinned.
  const shareOf = (parties: string[]): GroceryShare => ({ with: parties.filter(p => p !== ME), ...(parties.includes(ME) ? {} : { notMine: true as const }) });

  // Before an item's usual split changes to `next`, a month earlier than `before` (the month being edited, so a bought line this month is
  // pinned when next month's split is set) whose bought line that has no split of its own gets the one it was counted
  // with (the old usual, else the store's group), so changing the usual only moves things on from this month and never rewrites what was paid.
  const pinPastShares = (id: string, next: GroceryShare | null, before: string) => {
    const g = get().grocery; const item = g.items.find(i => i.id === id);
    if (!item || JSON.stringify(item.share ?? null) === JSON.stringify(next)) return;
    Object.entries(get().groceryMonths).forEach(([key, m]) => {
      const raw = m.lines[id];
      if (key >= before || !raw?.got || raw.share) return;
      const at = storeFor(g, item, m); // what it was counted with: people who are gone are not in the usual split or the store's group
      const live = (id: string) => activePeople(g).has(id) || !knownPeople(g).has(id); // a person who is gone is left out; an id that names nobody is kept as it is
      const pin = item.share ? { ...item.share, with: item.share.with.filter(live) } : shareOf(partiesFor(g, at === item.store ? item : { ...item, store: at }, raw));
      mutateMonth(key, mm => { mm.lines[id] = { ...mm.lines[id], share: pin }; });
    });
  };

  // Before an item's usual store changes, every bought line of it that has no store of its own is pinned to the store it was bought at (the old usual),
  // so its bill, its store's tax, who paid and the group's split stay as they were; the new store applies to what is bought from now on (code audit M-02).
  const pinPastStores = (id: string, was: string) => {
    Object.entries(get().groceryMonths).forEach(([key, m]) => {
      const raw = m.lines[id];
      if (!raw?.got || raw.store !== undefined) return;
      mutateMonth(key, mm => { mm.lines[id] = { ...mm.lines[id], store: was }; });
    });
  };

  // An item that is removed leaves its bought lines in their months as purchases (only the line's own price and count remain). Each is pinned to the store it
  // was bought at and the split it was counted with (read through partiesFor, so people who are gone are left out as they were), so its bill, its store's tax and
  // who shares it stay as they were (code audit M-04). The pins stay if the removal is undone: they are the split and store it was bought with.
  const pinRemoved = (item: GroceryItem) => {
    const g = get().grocery;
    Object.entries(get().groceryMonths).forEach(([key, m]) => {
      const raw = m.lines[item.id];
      if (!raw?.got) return;
      const at = storeFor(g, item, m);
      const valid = raw.store !== undefined && (raw.store === '' || g.stores.includes(raw.store)); // a month store that no longer exists reads as the item's usual store, so it is pinned too
      const store = !valid; const share = !raw.share;
      if (!store && !share) return;
      const parties = settle.partiesFor(g, at === item.store ? item : { ...item, store: at }, raw); // no group and no split of its own pins "just you", so a group made later does not reach back
      const usual: GroceryShare = { with: parties.filter(p => p !== SELF), ...(parties.includes(SELF) ? {} : { notMine: true as const }) };
      mutateMonth(key, mm => { const l = { ...mm.lines[item.id] }; if (store) l.store = at; if (share) l.share = usual; mm.lines[item.id] = l; });
    });
  };

  return {
    grocery: normGrocery(null),
    groceryMonths: {},

    // Syncing off: the list is this browser's storage, read at startup.
    loadGrocery() {
      const d = deviceGrocery();
      const { months = {}, ...g } = d ?? { ...normGrocery(null), months: {} };
      set(state => ({ grocery: g, groceryMonths: months, ready: { ...state.ready, groc: true, grocMonths: true } }));
    },

    // An import replaces the list. The file's data is written first; the old months go only if every write went through, so a full storage loses nothing.
    setGrocery(data) {
      const inc = normGroceryData(data) || { ...normGrocery(null), months: {} };
      const { months, ...clean } = inc;
      const old = Object.keys(get().groceryMonths);
      set({ grocery: clean, groceryMonths: months });
      saveMain(clean); Object.entries(months).forEach(([k, m]) => saveMonth(k, m));
      const failed = new Set(get().unsaved);
      if (![MAIN, ...Object.keys(months).map(monthPath)].some(p => failed.has(p))) old.forEach(k => { if (!months[k]) get().removeDoc(monthPath(k)); });
    },

    // "Add to my data", and the one-time upload of this device's list into the account (useAppStore adoptDeviceGrocery): what is
    // here stays, and only what is missing is added, matched by name and store, so nothing is lost or doubled.
    addGrocery(data) {
      const inc = normGroceryData(data);
      if (!inc || get().blocked()) return;
      const r = mergeGrocery(get().grocery, get().groceryMonths, inc);
      if (!r.changed) return;
      const before = get().grocery; const beforeMonths = get().groceryMonths;
      set({ grocery: r.grocery, groceryMonths: r.months });
      if (JSON.stringify(r.grocery) !== JSON.stringify(before)) saveMain(r.grocery);
      Object.entries(r.months).forEach(([k, m]) => { if (JSON.stringify(m) !== JSON.stringify(beforeMonths[k])) saveMonth(k, m); });
    },

    addGroceryItem(d) {
      const n = d.n.trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!n) return 'Give the item a name.';
      const qty = d.qty.trim() === '' ? 1 : cleanQty(d.qty);
      if (qty == null || qty <= 0) return 'The count must be a number from 0.01 to 999.';
      const priceText = d.price.trim();
      const cents = priceText === '' ? null : parseDollars(priceText);
      if (priceText !== '' && cents == null) return 'The price must be dollars, like 3.49.';
      const typedStore = d.store.trim().replace(/\s+/g, ' ').slice(0, 40);
      const note = (d.note ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_NOTE);
      const unit = UNITS.find(u => u === d.unit);
      return mutateCatalogue(g => {
        const store = sameStore(g, typedStore);
        if (g.items.length >= MAX_ITEMS) return `The list is full (${MAX_ITEMS} items).`;
        if (g.items.some(i => i.n.toLowerCase() === n.toLowerCase() && i.store === store)) return 'That item is already in this store’s list.';
        const full = ensureStore(g, store); if (full) return full;
        g.items.unshift({ id: newGroceryId(g.items, n, Object.values(get().groceryMonths).flatMap(m => Object.keys(m.lines))), n, store, qty, cents, every: true, out: false, ...(note ? { note } : {}), ...(unit ? { unit } : {}) });
        return null;
      });
    },

    updateGroceryItem(id, patch) {
      const was = get().grocery.items.find(i => i.id === id)?.store;
      const err = mutateCatalogue(g => {
        const it = g.items.find(i => i.id === id);
        if (!it) return 'That item is gone.';
        if (patch.n !== undefined) {
          const n = patch.n.trim().replace(/\s+/g, ' ').slice(0, 80);
          if (!n) return 'Give the item a name.';
          it.n = n;
        }
        if (patch.store !== undefined) {
          const store = sameStore(g, patch.store.trim().replace(/\s+/g, ' ').slice(0, 40));
          const full = ensureStore(g, store); if (full) return full;
          it.store = store;
        }
        if (patch.qty !== undefined) { const q = cleanQty(patch.qty); if (q == null || q <= 0) return 'The count must be a number from 0.01 to 999.'; it.qty = q; }
        if (patch.cents !== undefined) { if (patch.cents !== null && cleanCents(patch.cents) == null) return 'That price is not valid.'; it.cents = patch.cents; }
        if (patch.note !== undefined) { const note = patch.note.trim().replace(/\s+/g, ' ').slice(0, MAX_NOTE); if (note) it.note = note; else delete it.note; }
        if (patch.unit !== undefined) { const unit = UNITS.find(u => u === patch.unit); if (unit) it.unit = unit; else delete it.unit; }
        if (patch.every !== undefined) { it.every = patch.every; if (it.every) it.out = false; }
        if (g.items.some(i => i !== it && i.n.toLowerCase() === it.n.toLowerCase() && i.store === it.store)) return 'That item is already in this store’s list.';
        return null;
      });
      if (!err && patch.store !== undefined && was !== undefined && get().grocery.items.find(i => i.id === id)?.store !== was) pinPastStores(id, was);
      return err;
    },

    // Undo puts it back in its place (its ticks in each month were never removed), and its store if that went meanwhile.
    removeGroceryItem(id) {
      const i = get().grocery.items.findIndex(x => x.id === id); if (i < 0) return;
      const it = get().grocery.items[i];
      pinRemoved(it);
      if (mutateCatalogue(g => { g.items = g.items.filter(x => x.id !== id); return null; }) !== null) return;
      get().noteRemoved('grocery', it.n, () => {
        return mutateCatalogue(g => {
          if (g.items.some(x => x.id === id)) return 'back';
          if (it.store) ensureStore(g, it.store);
          g.items.splice(Math.min(i, g.items.length), 0, it); return null;
        }) === null;
      });
    },

    addGroceryStore(name) {
      const store = name.trim().replace(/\s+/g, ' ').slice(0, 40);
      if (!store) return 'Give the store a name.';
      return mutateCatalogue(g => {
        if (g.stores.some(s => s.toLowerCase() === store.toLowerCase())) return 'You already have that store.';
        return ensureStore(g, sameStore(g, store)); // a retired store of that name comes back with its history
      });
    },

    removeGroceryStore(name) {
      pinPastParties(); // the store leaves its group below: past months keep the split they were counted with
      const i = get().grocery.stores.indexOf(name);
      const retire = i >= 0 && historyUses(name);
      const held = (get().grocery.groups ?? []).filter(x => x.stores.includes(name)).map(x => x.id); // the group it defaulted to, for Undo
      const err = mutateCatalogue(g => {
        if (g.items.some(it => it.store === name)) return 'Move or remove this store’s items first.';
        g.stores = g.stores.filter(s => s !== name);
        if (retire) g.retired = [...(g.retired ?? []).filter(x => x !== name && historyUses(x)), name].slice(-MAX_STORES); // past months still name it: hidden, not forgotten; retired names no month names any more are dropped, which keeps the list from filling
        g.groups?.forEach(x => { x.stores = x.stores.filter(s => s !== name); });
        return null;
      });
      if (!err && i >= 0) {
        get().noteRemoved('grocerystores', name, () => mutateCatalogue(g => {
          if (g.stores.includes(name)) return 'back';
          if (g.stores.length >= MAX_STORES) return 'full';
          g.stores.splice(Math.min(i, g.stores.length), 0, name);
          if (g.retired?.includes(name)) { g.retired = g.retired.filter(x => x !== name); if (!g.retired.length) delete g.retired; }
          held.forEach(id => { const x = g.groups?.find(y => y.id === id); if (x && !g.groups!.some(y => y.stores.includes(name))) x.stores.push(name); }); // back in its group, if that still exists and no other group took it
          return null;
        }) === null);
      }
      return err;
    },

    setGroceryOut(id, out) {
      const it = get().grocery.items.find(i => i.id === id);
      if (!it || it.every || it.out === out) return;
      mutateCatalogue(g => { const x = g.items.find(i => i.id === id); if (x) x.out = out; return null; });
    },

    // Ticking records the count and price paid, so a later change to the catalogue does not rewrite that month. Bought means you have it,
    // so a "have" tick is dropped; unticking puts it back on the list. Each month keeps its own ticks (ADR 054).
    setGroceryGot(month, id, on) {
      const it = get().grocery.items.find(i => i.id === id);
      if (!it || !MONTH_RE.test(month)) return;
      mutateMonth(month, m => {
        const l = { ...(m.lines[id] || {}) };
        if (on) {
          delete l.have; l.got = true;
          if (!l.prices) {
            l.qty = l.qty ?? it.qty; if (l.cents == null && it.cents != null) l.cents = it.cents;
            if (l.cents == null) l.unpriced = true; else delete l.unpriced; // bought with no price: a price the item gets later must not price this month
          }
        } else { delete l.got; delete l.unpriced; }
        if (Object.keys(l).length) m.lines[id] = l; else delete m.lines[id];
      });
    },

    // The At home tick: you have it this month, so it is off that month's list. Unticking brings it back, and undoes a purchase too (the
    // same tick shows on both lists). A bought item is already had: ticking changes nothing.
    setGroceryHave(month, id, on) {
      if (!get().grocery.items.some(i => i.id === id) || !MONTH_RE.test(month)) return;
      mutateMonth(month, m => {
        const l = { ...(m.lines[id] || {}) };
        if (on) { if (!l.got) l.have = true; } else { delete l.have; delete l.got; delete l.unpriced; } // unticking drops the unpriced mark with the purchase
        if (Object.keys(l).length) m.lines[id] = l; else delete m.lines[id];
      });
    },

    setGroceryQty(month, id, qty) {
      const q = cleanQty(qty);
      if (q == null || q <= 0 || !get().grocery.items.some(i => i.id === id)) return;
      const it = get().grocery.items.find(i => i.id === id)!;
      mutateMonth(month, m => {
        const { prices: _p, packShares: _s, ...l } = m.lines[id] || {};
        const next: GroceryLine = { ...l, qty: q }; // a typed count goes back to one price for all
        // A bought line keeps what it was bought for: with no price of its own it takes the item's price as it is now, or stays unpriced, so a later price change does not reach back.
        if (next.got && next.cents === undefined && !next.unpriced) { if (it.cents != null) next.cents = it.cents; else next.unpriced = true; } // a line already bought unpriced stays so
        m.lines[id] = next;
      });
    },

    // The price of each one bought this month, when they differ (beef: 8.99, 10.49, 9.25). The count follows how many there are. Null (or
    // an empty list) goes back to a count and one price. The usual price of the item is left alone: it belongs to the single-price way.
    setGroceryPrices(month, id, prices) {
      const list = prices === null ? null : cleanPrices(prices);
      if ((prices !== null && !list) || !get().grocery.items.some(i => i.id === id)) return;
      mutateMonth(month, m => {
        const { prices: _p, qty: _q, cents: _c, unpriced: _u, packShares: ps, ...l } = m.lines[id] || {};
        const fit = ps && list ? list.map((_, i) => ps[i] ?? null) : null; // each pack keeps its share while the count changes
        const next: GroceryLine = list ? { ...l, prices: list, ...(fit?.some(Boolean) ? { packShares: fit } : {}) } : l.got ? { ...l, unpriced: true } : l; // back to one price with none typed: a bought line stays unpriced
        if (Object.keys(next).length) m.lines[id] = next; else delete m.lines[id];
      });
    },

    // The price typed this month is remembered as the item's usual price, but only for the current month: fixing an old month must not change today's.
    setGroceryCents(month, id, cents) {
      if (cents !== null && cleanCents(cents) == null) return;
      const it = get().grocery.items.find(i => i.id === id);
      if (!it) return;
      mutateMonth(month, m => {
        const l = { ...(m.lines[id] || {}) };
        delete l.prices; delete l.packShares; // one price for all
        if (cents === null) { delete l.cents; if (l.got) l.unpriced = true; } else { l.cents = cents; delete l.unpriced; }
        if (Object.keys(l).length) m.lines[id] = l; else delete m.lines[id];
      });
      // Clearing the price this month clears the usual price too; otherwise the item falls back to it and still shows a price.
      if (month === monthKey(new Date()) && it.cents !== cents) get().updateGroceryItem(id, { cents });
    },

    // "Take off the list": you don't need it this month. It is marked as had, so it is off that month's list, and its other lines stay.
    takeGroceryOff(month, id) { get().setGroceryHave(month, id, true); },
    // Move to: where an item was bought this month, when it is not its usual store (a month's choice, so next month it is back where it was).
    setGroceryLineStore(month, id, store) {
      const it = get().grocery.items.find(i => i.id === id);
      if (!it || !MONTH_RE.test(month)) return 'That item is gone.';
      if (store !== null && store !== '' && !get().grocery.stores.includes(store)) return 'That store is gone.';
      mutateMonth(month, m => {
        const l = { ...(m.lines[id] || {}) };
        if (store === null || store === it.store) delete l.store; else l.store = store; // its usual store is no choice at all
        if (Object.keys(l).length) m.lines[id] = l; else delete m.lines[id];
      });
      return null;
    },
    makeGroceryStoreUsual(month, id) {
      const it = get().grocery.items.find(i => i.id === id);
      if (!it || !MONTH_RE.test(month)) return 'That item is gone.';
      const store = storeFor(get().grocery, it, get().groceryMonths[month] || emptyMonth());
      if (store === it.store) return null;
      const err = get().updateGroceryItem(id, { store }); // the same rules as moving it on At home (a name already in that store is refused)
      if (err) return err;
      return get().setGroceryLineStore(month, id, null);
    },
    // Skip everything still to get this month: each unticked item is marked as had (off the list until the 1st), as Take off the list does for one.
    // Undo takes that mark off again (a count or price typed since stays), except on one you bought since. Returns how many were skipped.
    takeGroceryAllOff(month) {
      if (!MONTH_RE.test(month) || get().blocked()) return 0;
      const m = get().groceryMonths[month] || emptyMonth();
      const ids = onList(get().grocery, m, true).filter(i => !lineOf(i, m).got).map(i => i.id);
      if (!ids.length) return 0;
      mutateMonth(month, mm => ids.forEach(id => { mm.lines[id] = { ...(mm.lines[id] || {}), have: true }; }));
      get().noteRemoved('groceryoff', `${ids.length} ${ids.length === 1 ? 'item' : 'items'} from this month’s list`, () => {
        if (get().blocked()) return false; // sync is loading: nothing was put back, so say so
        mutateMonth(month, mm => ids.forEach(id => {
          const l = { ...(mm.lines[id] || {}) }; if (l.got) return; // bought since: leave it
          delete l.have;
          if (Object.keys(l).length) mm.lines[id] = l; else delete mm.lines[id];
        }));
        return true;
      });
      return ids.length;
    },

    // ---- Sharing what you buy with other people. Groups live in the catalogue (grocery/main); shares and who paid live on the item or the month. ----
    addGroceryGroup(name, people) {
      const n = name.trim().replace(/\s+/g, ' ').slice(0, MAX_PERSON);
      if (!n) return 'Give the group a name.';
      const names = people.map(p => p.trim().replace(/\s+/g, ' ').slice(0, MAX_PERSON)).filter(Boolean);
      if (names.length > MAX_PEOPLE) return `A group holds up to ${MAX_PEOPLE} people besides you.`;
      return mutateCatalogue(g => {
        const groups = g.groups ?? []; const live = groups.filter(x => !x.gone); // a group that is gone does not count, and its name can be used again
        if (live.length >= MAX_GROUPS || groups.length >= MAX_GROUPS * 2) return `Too many groups (${MAX_GROUPS}).`;
        if (live.some(x => x.n.toLowerCase() === n.toLowerCase())) return 'You already have a group with that name.';
        g.groups = [...groups, { id: newShareId(), n, people: names.map(pn => ({ id: newShareId(), n: pn })), stores: [] }];
        return null;
      });
    },
    renameGroceryGroup(id, name) {
      const n = name.trim().replace(/\s+/g, ' ').slice(0, MAX_PERSON);
      if (!n) return 'Give the group a name.';
      return mutateCatalogue(g => {
        const x = g.groups?.find(y => y.id === id);
        if (!x) return 'That group is gone.';
        if (g.groups!.some(y => y !== x && !y.gone && y.n.toLowerCase() === n.toLowerCase())) return 'You already have a group with that name.';
        x.n = n; return null;
      });
    },
    // Past months keep the group's people: when a month names one of them (a pinned split, a payer) the group is kept hidden, marked gone with its people, so those
    // months read as they did; with no month naming them it is deleted outright. An item's own split and anything new leave the people out (partiesOf, activePeople).
    removeGroceryGroup(id) {
      pinPastParties();
      const members = new Set((get().grocery.groups ?? []).find(x => x.id === id)?.people.map(p => p.id));
      const named = Object.values(get().groceryMonths).some(m =>
        Object.values(m.payer ?? {}).some(p => members.has(p)) || Object.values(m.lines).some(l => l.share?.with.some(p => members.has(p)) || l.packShares?.some(s => s?.with.some(p => members.has(p)))));
      mutateCatalogue(g => {
        const x = g.groups?.find(y => y.id === id);
        if (!x) return null;
        if (named) { x.gone = true; x.stores = []; x.people.forEach(p => { p.gone = true; }); } else g.groups = g.groups!.filter(y => y.id !== id);
        if (!g.groups!.length) delete g.groups;
        return null;
      });
    },
    addGroceryPerson(groupId, name) {
      const n = name.trim().replace(/\s+/g, ' ').slice(0, MAX_PERSON);
      if (!n) return 'Give the person a name.';
      pinPastParties();
      return mutateCatalogue(g => {
        const x = g.groups?.find(y => y.id === groupId);
        if (!x) return 'That group is gone.';
        const here = x.people.filter(p => !p.gone); // a person who is gone does not count, and their name can be used again
        if (here.length >= MAX_PEOPLE || x.people.length >= MAX_PEOPLE * 2) return `A group holds up to ${MAX_PEOPLE} people besides you.`;
        if (here.some(p => p.n.toLowerCase() === n.toLowerCase())) return 'That person is already in this group.';
        x.people.push({ id: newShareId(), n }); return null;
      });
    },
    updateGroceryPerson(groupId, personId, patch) {
      return mutateCatalogue(g => {
        const p = g.groups?.find(y => y.id === groupId)?.people.find(z => z.id === personId);
        if (!p) return 'That person is gone.';
        if (patch.n !== undefined) {
          const n = patch.n.trim().replace(/\s+/g, ' ').slice(0, MAX_PERSON);
          if (!n) return 'Give the person a name.';
          p.n = n;
        }
        if (patch.covered !== undefined) { if (patch.covered) p.covered = true; else delete p.covered; }
        return null;
      });
    },
    // Past months keep the person: a split or a payer that names them stays as it was, so they are marked gone (hidden, left out of anything new) instead of deleted.
    // A person no month names is deleted outright.
    removeGroceryPerson(groupId, personId) {
      pinPastParties();
      const named = Object.values(get().groceryMonths).some(m =>
        Object.values(m.payer ?? {}).includes(personId) || Object.values(m.lines).some(l => l.share?.with.includes(personId) || l.packShares?.some(s => s?.with.includes(personId))));
      mutateCatalogue(g => {
        const x = g.groups?.find(y => y.id === groupId); const p = x?.people.find(z => z.id === personId);
        if (!x || !p) return null;
        if (named) p.gone = true; else x.people = x.people.filter(z => z.id !== personId);
        return null;
      });
    },
    setGroceryStoreGroup(store, groupId) {
      pinPastParties();
      mutateCatalogue(g => {
        if (!g.stores.includes(store)) return 'That store is gone.';
        g.groups?.forEach(x => { x.stores = x.stores.filter(s => s !== store); }); // one group at most
        const x = groupId ? g.groups?.find(y => y.id === groupId) : undefined;
        if (x) x.stores.push(store);
        return null;
      });
    },
    setGroceryItemShare(id, share) {
      const clean = share === null ? null : cleanShare(share);
      if (share !== null && !clean) return;
      if (!get().grocery.items.some(i => i.id === id)) return;
      pinPastShares(id, clean, monthKey(new Date())); // an earlier month keeps the split it was bought with
      mutateCatalogue(g => { const it = g.items.find(i => i.id === id); if (!it) return 'That item is gone.'; if (clean) it.share = clean; else delete it.share; return null; });
    },
    // This month's split for the item. From this month on (not when fixing an older month) it is also the item's usual split, so next month starts
    // from it; changing it again moves the usual on. Months already bought keep what they had (pinPastShares), and a month that was set by hand keeps its own.
    setGroceryLineShare(month, id, share) {
      const clean = share === null ? null : cleanShare(share);
      if ((share !== null && !clean) || !get().grocery.items.some(i => i.id === id)) return;
      if (month >= monthKey(new Date())) {
        pinPastShares(id, clean, month);
        mutateCatalogue(g => { const it = g.items.find(i => i.id === id); if (!it) return 'That item is gone.'; if (clean) it.share = clean; else delete it.share; return null; });
      }
      mutateMonth(month, m => {
        const l = { ...(m.lines[id] || {}) };
        if (clean) l.share = clean; else delete l.share;
        if (Object.keys(l).length) m.lines[id] = l; else delete m.lines[id];
      });
    },
    setGroceryPackShare(month, id, index, share) {
      const clean = share === null ? null : cleanShare(share);
      if ((share !== null && !clean) || !get().grocery.items.some(i => i.id === id)) return;
      mutateMonth(month, m => {
        const l = { ...(m.lines[id] || {}) };
        if (!l.prices || !Number.isInteger(index) || index < 0 || index >= l.prices.length) return; // only a line priced pack by pack has packs
        const packs = l.prices.map((_, i) => l.packShares?.[i] ?? null);
        packs[index] = clean;
        if (packs.some(Boolean)) l.packShares = packs; else delete l.packShares;
        m.lines[id] = l;
      });
    },
    setGroceryPayer(month, store, personId) {
      mutateMonth(month, m => {
        const payer = { ...(m.payer ?? {}) };
        if (personId) payer[store] = personId; else delete payer[store];
        if (Object.keys(payer).length) m.payer = payer; else delete m.payer;
        // Another payer is another set of payments: the store's settled marks start over.
        const paid = Object.fromEntries(Object.entries(m.paid ?? {}).filter(([k]) => !k.startsWith(`${store}\n`)));
        if (Object.keys(paid).length) m.paid = paid; else delete m.paid;
      });
    },
    // Marks an owed amount settled (or not) outside the app. Only a mark that differs from the default is kept; amounts never change.
    setGroceryPaid(month, store, person, paid) {
      const m = get().groceryMonths[month]; if (!m) return;
      const row = storeStatus(get().grocery, m, store).rows.find(r => r.id === person); if (!row) return;
      mutateMonth(month, mm => {
        const marks = { ...(mm.paid ?? {}) };
        if (paid === row.usual) delete marks[row.key]; else marks[row.key] = paid ? row.cents : false; // paid: the cents settled now
        if (Object.keys(marks).length) mm.paid = marks; else delete mm.paid;
      });
    },
    setGroceryTax(month, store, cents) {
      if (cents !== null && (cleanCents(cents) == null || cents <= 0)) return;
      mutateMonth(month, m => {
        const tax = { ...(m.tax ?? {}) };
        if (cents) tax[store] = cents; else delete tax[store];
        if (Object.keys(tax).length) m.tax = tax; else delete m.tax;
      });
    },
  };
};
