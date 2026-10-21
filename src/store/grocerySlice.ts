import { LS } from '../lib/storage.js';
import {
  MAX_GROUPS, MAX_ITEMS, MAX_NOTE, MAX_PEOPLE, MAX_PERSON, MAX_STORES, MONTH_RE, UNITS, cleanCents, cleanPrices, cleanQty, emptyMonth, lineOf, mergeGrocery, monthEmpty, monthKey, newGroceryId, newShareId, normGrocery, normGroceryData, onList, parseDollars, storeFor,
} from '../lib/grocery.js';
import { cleanShare } from '../shared/grocery.js';
import { groupOfStore } from '../lib/grocerySettle.js';
import type { Grocery, GroceryData, GroceryLine, GroceryMonth, GroceryShare } from '../types.ts';
import type { GrocerySlice, StoreGet, StoreSet } from './types.ts';

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
  const sameStore = (g: Grocery, store: string) => g.stores.find(x => x.toLowerCase() === store.toLowerCase()) ?? store;
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

  // Before an item's usual split changes to `next`, a month earlier than `before` (the month being edited, so a bought line this month is
  // pinned when next month's split is set) whose bought line that has no split of its own gets the one it was counted
  // with (the old usual, else the store's group), so changing the usual only moves things on from this month and never rewrites what was paid.
  const pinPastShares = (id: string, next: GroceryShare | null, before: string) => {
    const g = get().grocery; const item = g.items.find(i => i.id === id);
    if (!item || JSON.stringify(item.share ?? null) === JSON.stringify(next)) return;
    Object.entries(get().groceryMonths).forEach(([key, m]) => {
      const raw = m.lines[id];
      if (key >= before || !raw?.got || raw.share) return;
      const pin: GroceryShare = item.share ?? { with: (groupOfStore(g, storeFor(g, item, m))?.people ?? []).map(p => p.id) };
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
        if (store && !g.stores.includes(store)) { if (g.stores.length >= MAX_STORES) return `Too many stores (${MAX_STORES}).`; g.stores.push(store); }
        g.items.unshift({ id: newGroceryId(g.items, n), n, store, qty, cents, every: true, out: false, ...(note ? { note } : {}), ...(unit ? { unit } : {}) });
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
          if (store && !g.stores.includes(store)) { if (g.stores.length >= MAX_STORES) return `Too many stores (${MAX_STORES}).`; g.stores.push(store); }
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
      if (mutateCatalogue(g => { g.items = g.items.filter(x => x.id !== id); return null; }) !== null) return;
      get().noteRemoved('grocery', it.n, () => mutateCatalogue(g => {
        if (g.items.some(x => x.id === id)) return 'back';
        if (it.store && !g.stores.includes(it.store)) g.stores.push(it.store);
        g.items.splice(Math.min(i, g.items.length), 0, it); return null;
      }) === null);
    },

    addGroceryStore(name) {
      const store = name.trim().replace(/\s+/g, ' ').slice(0, 40);
      if (!store) return 'Give the store a name.';
      return mutateCatalogue(g => {
        if (g.stores.some(s => s.toLowerCase() === store.toLowerCase())) return 'You already have that store.';
        if (g.stores.length >= MAX_STORES) return `Too many stores (${MAX_STORES}).`;
        g.stores.push(store); return null;
      });
    },

    removeGroceryStore(name) {
      const i = get().grocery.stores.indexOf(name);
      const held = (get().grocery.groups ?? []).filter(x => x.stores.includes(name)).map(x => x.id); // the group it defaulted to, for Undo
      const err = mutateCatalogue(g => {
        if (g.items.some(it => it.store === name)) return 'Move or remove this store’s items first.';
        g.stores = g.stores.filter(s => s !== name);
        g.groups?.forEach(x => { x.stores = x.stores.filter(s => s !== name); });
        return null;
      });
      if (!err && i >= 0) {
        get().noteRemoved('grocerystores', name, () => mutateCatalogue(g => {
          if (g.stores.includes(name)) return 'back';
          if (g.stores.length >= MAX_STORES) return 'full';
          g.stores.splice(Math.min(i, g.stores.length), 0, name);
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
        if (on) { if (!l.got) l.have = true; } else { delete l.have; delete l.got; }
        if (Object.keys(l).length) m.lines[id] = l; else delete m.lines[id];
      });
    },

    setGroceryQty(month, id, qty) {
      const q = cleanQty(qty);
      if (q == null || q <= 0 || !get().grocery.items.some(i => i.id === id)) return;
      mutateMonth(month, m => { const { prices: _p, packShares: _s, ...l } = m.lines[id] || {}; m.lines[id] = { ...l, qty: q }; }); // a typed count goes back to one price for all
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
        const groups = g.groups ?? [];
        if (groups.length >= MAX_GROUPS) return `Too many groups (${MAX_GROUPS}).`;
        if (groups.some(x => x.n.toLowerCase() === n.toLowerCase())) return 'You already have a group with that name.';
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
        if (g.groups!.some(y => y !== x && y.n.toLowerCase() === n.toLowerCase())) return 'You already have a group with that name.';
        x.n = n; return null;
      });
    },
    // Items and months that named its people keep their shares; a person who no longer exists is simply left out of a split (partiesOf).
    removeGroceryGroup(id) {
      mutateCatalogue(g => { g.groups = (g.groups ?? []).filter(x => x.id !== id); if (!g.groups.length) delete g.groups; return null; });
    },
    addGroceryPerson(groupId, name) {
      const n = name.trim().replace(/\s+/g, ' ').slice(0, MAX_PERSON);
      if (!n) return 'Give the person a name.';
      return mutateCatalogue(g => {
        const x = g.groups?.find(y => y.id === groupId);
        if (!x) return 'That group is gone.';
        if (x.people.length >= MAX_PEOPLE) return `A group holds up to ${MAX_PEOPLE} people besides you.`;
        if (x.people.some(p => p.n.toLowerCase() === n.toLowerCase())) return 'That person is already in this group.';
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
    removeGroceryPerson(groupId, personId) {
      mutateCatalogue(g => { const x = g.groups?.find(y => y.id === groupId); if (x) x.people = x.people.filter(p => p.id !== personId); return null; });
    },
    setGroceryStoreGroup(store, groupId) {
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
