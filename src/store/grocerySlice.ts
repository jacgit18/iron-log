import { LS } from '../lib/storage.js';
import {
  MAX_ITEMS, MAX_STORES, MONTH_RE, cleanCents, cleanQty, emptyMonth, mergeGrocery, monthEmpty, monthKey, newGroceryId, normGrocery, normGroceryData, normGroceryMonth, parseDollars,
} from '../lib/grocery.js';
import type { Grocery, GroceryMonth } from '../types.ts';
import type { Flag, GrocerySlice, StoreGet, StoreSet } from './types.ts';

// The grocery list is kept on this device only, in the browser's storage (like display options): its paths are not in the
// sync's map (parsePath), so it never reaches the server. It belongs to the device's owner, like the synced data: it is cleared when the
// device is handed to another account (apiDb onOwnerChange) and by "Delete my data" (DeleteMyData.tsx forgetDevice); a plain sign-out and
// sign-in as the same account keeps it. It is in the data file and the backups. `flag` is the save-status helper from the app store.
const MAIN = 'grocery/main';

export const grocerySlice = (set: StoreSet, get: StoreGet, flag: Flag): GrocerySlice => {
  const saveMain = (g: Grocery) => { const ok = LS.set(MAIN, g); if (!ok) flag('Storage full'); return ok; };
  const saveMonth = (key: string, m: GroceryMonth) => {
    if (monthEmpty(m)) { LS.remove('grocery/' + key); return true; } // an untouched month is the fresh list: nothing to keep
    const ok = LS.set('grocery/' + key, m); if (!ok) flag('Storage full'); return ok;
  };
  const mutateCatalogue = (fn: (g: Grocery) => string | null): string | null => {
    const g = structuredClone(get().grocery);
    const err = fn(g);
    if (err) return err;
    set({ grocery: g }); saveMain(g); return null;
  };
  const mutateMonth = (key: string, fn: (m: GroceryMonth) => void) => {
    if (!MONTH_RE.test(key)) return;
    const m = structuredClone(get().groceryMonths[key] || emptyMonth());
    fn(m);
    const months = { ...get().groceryMonths };
    if (monthEmpty(m)) delete months[key]; else months[key] = m;
    set({ groceryMonths: months }); saveMonth(key, m);
  };

  return {
    grocery: normGrocery(null),
    groceryMonths: {},

    loadGrocery() {
      const months: Record<string, GroceryMonth> = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k || !k.startsWith('ironlog:grocery/')) continue;
          const key = k.slice('ironlog:grocery/'.length);
          if (!MONTH_RE.test(key)) continue;
          const m = normGroceryMonth(LS.get('grocery/' + key));
          if (!monthEmpty(m)) months[key] = m;
        }
      } catch { /* storage unavailable: start with the fresh list */ }
      set({ grocery: normGrocery(LS.get(MAIN)), groceryMonths: months });
    },

    // An import replaces the list. The file's data is written first; the old months go only if every write went through, so a full storage loses nothing.
    setGrocery(data) {
      const inc = normGroceryData(data) || { ...normGrocery(null), months: {} };
      const { months, ...clean } = inc;
      const old = Object.keys(get().groceryMonths);
      set({ grocery: clean, groceryMonths: months });
      const ok = [saveMain(clean), ...Object.entries(months).map(([k, m]) => saveMonth(k, m))].every(Boolean);
      if (ok) old.forEach(k => { if (!months[k]) LS.remove('grocery/' + k); });
    },

    addGrocery(data) {
      const inc = normGroceryData(data);
      if (!inc) return;
      const r = mergeGrocery(get().grocery, get().groceryMonths, inc);
      if (!r.changed) return;
      set({ grocery: r.grocery, groceryMonths: r.months });
      saveMain(r.grocery); Object.entries(r.months).forEach(([k, m]) => saveMonth(k, m));
    },

    clearGrocery() {
      Object.keys(get().groceryMonths).forEach(k => LS.remove('grocery/' + k));
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('ironlog:grocery/')) LS.remove(k.slice('ironlog:'.length)); }
      } catch { /* storage unavailable */ }
      set({ grocery: normGrocery(null), groceryMonths: {} });
    },

    addGroceryItem(d) {
      const n = d.n.trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!n) return 'Give the item a name.';
      const qty = d.qty.trim() === '' ? 1 : cleanQty(d.qty);
      if (qty == null || qty <= 0) return 'The count must be a number from 0.01 to 999.';
      const priceText = d.price.trim();
      const cents = priceText === '' ? null : parseDollars(priceText);
      if (priceText !== '' && cents == null) return 'The price must be dollars, like 3.49.';
      const store = d.store.trim().replace(/\s+/g, ' ').slice(0, 40);
      return mutateCatalogue(g => {
        if (g.items.length >= MAX_ITEMS) return `The list is full (${MAX_ITEMS} items).`;
        if (g.items.some(i => i.n.toLowerCase() === n.toLowerCase() && i.store === store)) return 'That item is already in this store’s list.';
        if (store && !g.stores.includes(store)) { if (g.stores.length >= MAX_STORES) return `Too many stores (${MAX_STORES}).`; g.stores.push(store); }
        g.items.push({ id: newGroceryId(g.items, n), n, store, qty, cents, every: d.every, out: false });
        return null;
      });
    },

    updateGroceryItem(id, patch) {
      return mutateCatalogue(g => {
        const it = g.items.find(i => i.id === id);
        if (!it) return 'That item is gone.';
        if (patch.n !== undefined) {
          const n = patch.n.trim().replace(/\s+/g, ' ').slice(0, 80);
          if (!n) return 'Give the item a name.';
          it.n = n;
        }
        if (patch.store !== undefined) {
          const store = patch.store.trim().replace(/\s+/g, ' ').slice(0, 40);
          if (store && !g.stores.includes(store)) { if (g.stores.length >= MAX_STORES) return `Too many stores (${MAX_STORES}).`; g.stores.push(store); }
          it.store = store;
        }
        if (patch.qty !== undefined) { const q = cleanQty(patch.qty); if (q == null || q <= 0) return 'The count must be a number from 0.01 to 999.'; it.qty = q; }
        if (patch.cents !== undefined) { if (patch.cents !== null && cleanCents(patch.cents) == null) return 'That price is not valid.'; it.cents = patch.cents; }
        if (patch.every !== undefined) { it.every = patch.every; if (it.every) it.out = false; }
        if (g.items.some(i => i !== it && i.n.toLowerCase() === it.n.toLowerCase() && i.store === it.store)) return 'That item is already in this store’s list.';
        return null;
      });
    },

    // Undo puts it back in its place (its ticks in each month were never removed), and its store if that went meanwhile.
    removeGroceryItem(id) {
      const i = get().grocery.items.findIndex(x => x.id === id); if (i < 0) return;
      const it = get().grocery.items[i];
      mutateCatalogue(g => { g.items = g.items.filter(x => x.id !== id); return null; });
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
      const err = mutateCatalogue(g => {
        if (g.items.some(it => it.store === name)) return 'Move or remove this store’s items first.';
        g.stores = g.stores.filter(s => s !== name); return null;
      });
      if (!err && i >= 0) {
        get().noteRemoved('grocerystores', name, () => mutateCatalogue(g => {
          if (g.stores.includes(name)) return 'back';
          if (g.stores.length >= MAX_STORES) return 'full';
          g.stores.splice(Math.min(i, g.stores.length), 0, name); return null;
        }) === null);
      }
      return err;
    },

    setGroceryOut(id, out) {
      const it = get().grocery.items.find(i => i.id === id);
      if (!it || it.every || it.out === out) return;
      mutateCatalogue(g => { const x = g.items.find(i => i.id === id); if (x) x.out = out; return null; });
    },

    // Ticking records the count and price paid, so a later change to the catalogue does not rewrite that month. In the current month
    // it also closes the loop on a When-out item: bought means you have it again, and unticking puts it back to out. An older month
    // is history and leaves what is at home alone.
    setGroceryGot(month, id, on) {
      const it = get().grocery.items.find(i => i.id === id);
      if (!it || !MONTH_RE.test(month)) return;
      mutateMonth(month, m => {
        const l = { ...(m.lines[id] || {}) };
        if (on) { l.got = true; l.qty = l.qty ?? it.qty; if (l.cents == null && it.cents != null) l.cents = it.cents; } else delete l.got;
        if (Object.keys(l).length) m.lines[id] = l; else delete m.lines[id];
      });
      if (month === monthKey(new Date()) && !it.every) get().setGroceryOut(id, !on);
    },

    setGroceryQty(month, id, qty) {
      const q = cleanQty(qty);
      if (q == null || q <= 0 || !get().grocery.items.some(i => i.id === id)) return;
      mutateMonth(month, m => { m.lines[id] = { ...(m.lines[id] || {}), qty: q }; });
    },

    // The price typed this month is remembered as the item's usual price, but only for the current month: fixing an old month must not change today's.
    setGroceryCents(month, id, cents) {
      if (cents !== null && cleanCents(cents) == null) return;
      const it = get().grocery.items.find(i => i.id === id);
      if (!it) return;
      mutateMonth(month, m => {
        const l = { ...(m.lines[id] || {}) };
        if (cents === null) delete l.cents; else l.cents = cents;
        if (Object.keys(l).length) m.lines[id] = l; else delete m.lines[id];
      });
      if (month === monthKey(new Date()) && cents !== null && it.cents !== cents) get().updateGroceryItem(id, { cents });
    },

    // "Take off the list": you don't need it after all. Its line goes too, so nothing of it is left on that month.
    takeGroceryOff(month, id) {
      const it = get().grocery.items.find(i => i.id === id);
      if (!it || it.every) return;
      if (it.out && month === monthKey(new Date())) get().setGroceryOut(id, false);
      if (get().groceryMonths[month]) mutateMonth(month, m => { m.pulled = m.pulled.filter(x => x !== id); delete m.lines[id]; });
    },
  };
};
