import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { clearStorage, saved, mem } from '../test/browserStubs.js';

let useAppStore; const st = () => useAppStore.getState();
const form = (o = {}) => ({ n: 'Kale', store: 'Veg market', qty: '2', price: '2.50', every: true, ...o });
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { setAdmin } = await import('../features.js'); setAdmin(true);
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
});
const thisMonth = async () => (await import('../lib/grocery.js')).monthKey(new Date());

describe('the catalogue', () => {
  it('adds an item with its store, count and price, and saves it on the device', () => {
    expect(st().addGroceryItem(form())).toBeNull();
    expect(st().grocery.items).toEqual([{ id: 'kale', n: 'Kale', store: 'Veg market', qty: 2, cents: 250, every: true, out: false }]);
    expect(st().grocery.stores).toEqual(['Veg market']);
    expect(saved('grocery/main').items[0].cents).toBe(250);
  });
  it('keeps a note on add, sets and clears it on update, and leaves the key out when there is none', () => {
    expect(st().addGroceryItem(form({ note: '  the green   ones ' }))).toBeNull();
    expect(st().grocery.items[0].note).toBe('the green ones');
    expect(saved('grocery/main').items[0].note).toBe('the green ones');
    expect(st().updateGroceryItem('kale', { note: 'ask at the deli' })).toBeNull();
    expect(st().grocery.items[0].note).toBe('ask at the deli');
    expect(st().updateGroceryItem('kale', { note: '   ' })).toBeNull();
    expect('note' in st().grocery.items[0]).toBe(false); // cleared: the key is gone, not an empty string
    expect(st().addGroceryItem(form({ n: 'Rice', store: 'Costco' }))).toBeNull();
    expect('note' in st().grocery.items[1]).toBe(false);
  });
  it('refuses a blank name, a bad count, a bad price and a repeat in the same store, and changes nothing', () => {
    expect(st().addGroceryItem(form({ n: '  ' }))).toMatch(/name/);
    expect(st().addGroceryItem(form({ qty: '0' }))).toMatch(/count/);
    expect(st().addGroceryItem(form({ qty: 'x' }))).toMatch(/count/);
    expect(st().addGroceryItem(form({ price: '1.999' }))).toMatch(/price/);
    expect(st().grocery.items).toEqual([]);
    expect(st().addGroceryItem(form())).toBeNull();
    expect(st().addGroceryItem(form({ n: 'kale' }))).toMatch(/already/);
    expect(st().addGroceryItem(form({ store: 'Costco' }))).toBeNull(); // same name, other store: fine
    expect(st().grocery.items).toHaveLength(2);
  });
  it('defaults the count to 1 and the price to none', () => {
    st().addGroceryItem(form({ qty: '', price: '', store: '' }));
    expect(st().grocery.items[0]).toMatchObject({ qty: 1, cents: null, store: '' });
  });
  it('edits, moves and removes an item', () => {
    st().addGroceryItem(form());
    expect(st().updateGroceryItem('kale', { n: 'Curly kale', store: 'Costco', qty: 3 })).toBeNull();
    expect(st().grocery.items[0]).toMatchObject({ n: 'Curly kale', store: 'Costco', qty: 3 });
    expect(st().grocery.stores).toEqual(['Veg market', 'Costco']);
    expect(st().updateGroceryItem('kale', { qty: 0 })).toMatch(/count/);
    expect(st().updateGroceryItem('nope', { qty: 1 })).toMatch(/gone/);
    st().removeGroceryItem('kale');
    expect(st().grocery.items).toEqual([]);
  });
  it('keeps a store until it has no items', () => {
    st().addGroceryItem(form());
    expect(st().removeGroceryStore('Veg market')).toMatch(/first/);
    st().removeGroceryItem('kale');
    expect(st().removeGroceryStore('Veg market')).toBeNull();
    expect(st().grocery.stores).toEqual([]);
    expect(st().addGroceryStore('Costco')).toBeNull();
    expect(st().addGroceryStore('costco')).toMatch(/already/);
  });
  it('puts a new item at the top of its store’s section', () => {
    st().addGroceryItem(form({ n: 'Eggs', store: 'Aldi' })); st().addGroceryItem(form({ n: 'Rice', store: 'Costco' })); st().addGroceryItem(form({ n: 'Oats', store: 'Aldi' }));
    expect(st().grocery.items.filter(i => i.store === 'Aldi').map(i => i.n)).toEqual(['Oats', 'Eggs']);
    expect(st().grocery.items.filter(i => i.store === 'Costco').map(i => i.n)).toEqual(['Rice']);
  });
  it('treats a store typed in another case as the store you have, on add and on move', () => {
    st().addGroceryItem(form({ n: 'Eggs', store: 'Aldi' }));
    expect(st().addGroceryItem(form({ n: 'Eggs', store: 'aldi' }))).toMatch(/already/); // not a second Eggs in a second "aldi"
    expect(st().addGroceryItem(form({ n: 'Rice', store: ' ALDI ' }))).toBeNull();
    expect(st().grocery.stores).toEqual(['Aldi']);
    expect(st().grocery.items.map(i => i.store)).toEqual(['Aldi', 'Aldi']);
    st().addGroceryItem(form({ n: 'Oats', store: '' }));
    expect(st().updateGroceryItem('oats', { store: 'aldi' })).toBeNull();
    expect(st().grocery.items.find(i => i.id === 'oats').store).toBe('Aldi');
    expect(st().grocery.stores).toEqual(['Aldi']);
  });
  it('clearing this month’s price clears the usual price too, so no price shows', async () => {
    const mk = await thisMonth();
    st().addGroceryItem(form());
    st().setGroceryCents(mk, 'kale', null);
    expect(st().grocery.items[0].cents).toBeNull();
    const { lineOf, emptyMonth } = await import('../lib/grocery.js');
    expect(lineOf(st().grocery.items[0], st().groceryMonths[mk] || emptyMonth()).cents).toBeNull();
  });
  it('Undo puts a removed item back in its place, with its store if that went meanwhile', () => {
    st().addGroceryItem(form()); st().addGroceryItem({ ...form(), n: 'Eggs', store: '' });
    const before = st().grocery.items;
    st().removeGroceryItem('kale');
    expect(st().removed).toMatchObject({ scope: 'grocery', text: 'Kale' });
    st().undoRemoved();
    expect(st().grocery.items).toEqual(before);
    st().removeGroceryItem('kale');
    useAppStore.setState({ grocery: { ...st().grocery, stores: [] } });
    st().undoRemoved();
    expect(st().grocery.items).toEqual(before); expect(st().grocery.stores).toEqual(['Veg market']);
  });
  it('Undo puts a removed store back in its place', () => {
    st().addGroceryStore('A'); st().addGroceryStore('B'); st().addGroceryStore('C');
    st().removeGroceryStore('B');
    expect(st().removed).toMatchObject({ scope: 'grocerystores', text: 'B' });
    st().undoRemoved();
    expect(st().grocery.stores).toEqual(['A', 'B', 'C']);
  });
});

describe('a month', () => {
  it('starts fresh from the catalogue: nothing is stored until something is ticked or changed', async () => {
    st().addGroceryItem(form());
    expect(st().groceryMonths).toEqual({});
    expect(saved('grocery/' + await thisMonth())).toBeNull();
  });
  it('ticking records the count and price paid, and unticking keeps them', async () => {
    const mk = await thisMonth();
    st().addGroceryItem(form());
    st().setGroceryGot(mk, 'kale', true);
    expect(st().groceryMonths[mk].lines.kale).toEqual({ got: true, qty: 2, cents: 250 });
    expect(saved('grocery/' + mk).lines.kale.got).toBe(true);
    st().setGroceryGot(mk, 'kale', false);
    expect(st().groceryMonths[mk].lines.kale).toEqual({ qty: 2, cents: 250 });
  });
  it('another month is untouched, and a later catalogue change does not rewrite a ticked month', async () => {
    const mk = await thisMonth(); const { shiftMonth } = await import('../lib/grocery.js');
    st().addGroceryItem(form());
    st().setGroceryGot(mk, 'kale', true);
    st().updateGroceryItem('kale', { cents: 999, qty: 9 });
    expect(st().groceryMonths[mk].lines.kale).toMatchObject({ qty: 2, cents: 250 });
    expect(st().groceryMonths[shiftMonth(mk, 1)]).toBeUndefined();
  });
  it('a count or price change is this month’s only; the price typed this month is remembered for next', async () => {
    const mk = await thisMonth(); const { shiftMonth } = await import('../lib/grocery.js');
    st().addGroceryItem(form());
    st().setGroceryQty(mk, 'kale', 5);
    expect(st().grocery.items[0].qty).toBe(2);
    st().setGroceryCents(mk, 'kale', 300);
    expect(st().grocery.items[0].cents).toBe(300);
    st().setGroceryCents(shiftMonth(mk, -2), 'kale', 100); // fixing an old month does not change today’s price
    expect(st().grocery.items[0].cents).toBe(300);
    expect(st().groceryMonths[shiftMonth(mk, -2)].lines.kale.cents).toBe(100);
  });
  it('ignores a bad month key, a bad count and an unknown item', async () => {
    st().addGroceryItem(form());
    st().setGroceryGot('2026-13', 'kale', true);
    st().setGroceryGot('x', 'kale', true);
    st().setGroceryQty(await thisMonth(), 'kale', -1);
    st().setGroceryGot(await thisMonth(), 'ghost', true);
    expect(st().groceryMonths).toEqual({});
  });
  it('ticking Have takes an item off this month’s list and nothing else; unticking brings it back, and an empty month is not kept', async () => {
    const mk = await thisMonth();
    st().addGroceryItem(form());
    st().setGroceryHave(mk, 'kale', true);
    expect(st().groceryMonths[mk].lines.kale).toEqual({ have: true });
    expect(saved('grocery/' + mk).lines.kale.have).toBe(true);
    expect(st().grocery.items[0]).toMatchObject({ qty: 2, cents: 250 }); // the catalogue is untouched: a tick belongs to its month
    st().setGroceryHave(mk, 'kale', false);
    expect(st().groceryMonths[mk]).toBeUndefined();
    expect(saved('grocery/' + mk)).toBeNull();
  });
  it('is per month: a tick in one month leaves the others alone, so a new month starts with nothing ticked', async () => {
    const mk = await thisMonth(); const { shiftMonth } = await import('../lib/grocery.js');
    st().addGroceryItem(form());
    st().setGroceryHave(mk, 'kale', true);
    expect(st().groceryMonths[shiftMonth(mk, 1)]).toBeUndefined();
    expect(st().groceryMonths[shiftMonth(mk, -1)]).toBeUndefined();
  });
  it('buying counts as having it, and the same tick undoes it: bought drops a Have tick, and unticking Have unbuys', async () => {
    const mk = await thisMonth();
    st().addGroceryItem(form());
    st().setGroceryHave(mk, 'kale', true);
    st().setGroceryGot(mk, 'kale', true);
    expect(st().groceryMonths[mk].lines.kale).toEqual({ got: true, qty: 2, cents: 250 }); // no `have` next to `got`
    st().setGroceryHave(mk, 'kale', true); // already had: no change
    expect(st().groceryMonths[mk].lines.kale.got).toBe(true);
    st().setGroceryHave(mk, 'kale', false); // unticked at home: not bought either
    expect(st().groceryMonths[mk].lines.kale).toEqual({ qty: 2, cents: 250 });
  });
  it('ignores a Have tick for a bad month or an unknown item', async () => {
    st().addGroceryItem(form());
    st().setGroceryHave('2026-13', 'kale', true);
    st().setGroceryHave(await thisMonth(), 'ghost', true);
    expect(st().groceryMonths).toEqual({});
  });
  it('take off the list marks the item as had that month and keeps its count, in any month', async () => {
    const mk = await thisMonth(); const { shiftMonth } = await import('../lib/grocery.js'); const last = shiftMonth(mk, -1);
    st().addGroceryItem(form());
    st().setGroceryQty(mk, 'kale', 3);
    st().takeGroceryOff(mk, 'kale');
    expect(st().groceryMonths[mk].lines.kale).toEqual({ qty: 3, have: true });
    st().takeGroceryOff(last, 'kale');
    expect(st().groceryMonths[last].lines.kale).toEqual({ have: true });
  });
  it('takes off an item an older version pulled onto a month: it is had, so it is off the list', async () => {
    const mk = await thisMonth();
    st().addGroceryItem(form({ n: 'Saffron' }));
    useAppStore.setState({ groceryMonths: { [mk]: { lines: {}, pulled: ['saffron'] } } });
    st().takeGroceryOff(mk, 'saffron');
    expect(st().groceryMonths[mk].lines.saffron).toEqual({ have: true });
  });
});

describe('loading and replacing', () => {
  it('reads the catalogue and every saved month back from storage', async () => {
    const mk = await thisMonth();
    st().addGroceryItem(form());
    st().setGroceryGot(mk, 'kale', true);
    useAppStore.setState({ grocery: { stores: [], items: [] }, groceryMonths: {} });
    st().loadGrocery();
    expect(st().grocery.items[0].id).toBe('kale');
    expect(st().groceryMonths[mk].lines.kale.got).toBe(true);
  });
  it('an import replaces the catalogue and the months, and leaves no old month behind', async () => {
    const mk = await thisMonth();
    st().addGroceryItem(form());
    st().setGroceryGot(mk, 'kale', true);
    st().setGrocery({ stores: ['Costco'], items: [{ id: 'rice', n: 'Rice', store: 'Costco', qty: 1, cents: 100, every: true, out: false }], months: { '2026-01': { lines: { rice: { got: true } }, pulled: [] }, nope: { lines: {} } } });
    expect(st().grocery.items.map(i => i.id)).toEqual(['rice']);
    expect(Object.keys(st().groceryMonths)).toEqual(['2026-01']);
    expect(saved('grocery/' + mk)).toBeNull();
    expect(saved('grocery/2026-01').lines.rice.got).toBe(true);
  });
});

describe('the data file', () => {
  it('a backup holds the list and an import adds what is missing without touching what is here', async () => {
    const mk = await thisMonth();
    st().addGroceryItem(form());
    st().setGroceryGot(mk, 'kale', true);
    const { buildDataFile, normalizeData } = await import('../lib/export.js');
    const file = normalizeData(JSON.parse(JSON.stringify(buildDataFile(st().snapshot(), {}))));
    expect(file.grocery.items.map(i => i.id)).toEqual(['kale']);
    expect(file.grocery.months[mk].lines.kale.got).toBe(true);
    // here: the same item changed, plus another; the file adds only what is new
    st().updateGroceryItem('kale', { qty: 7 });
    st().addGroceryItem(form({ n: 'Rice', store: 'Costco', qty: '1', price: '' }));
    st().setGroceryGot(mk, 'kale', false);
    st().addGrocery(file.grocery);
    expect(st().grocery.items.map(i => [i.id, i.qty])).toEqual([['rice', 1], ['kale', 7]]);
    expect(st().groceryMonths[mk].lines.kale.got).toBeUndefined(); // the line here (unticked) stays; the file's tick does not override it
  });
  it('a file with no list leaves the data file without a grocery part', async () => {
    const { buildDataFile } = await import('../lib/export.js');
    expect('grocery' in buildDataFile(st().snapshot(), {})).toBe(false);
  });
});

describe('who sees and keeps the list', () => {
  it('with syncing off, the list is this browser\'s storage: saved there and read back at startup', async () => {
    const mk = await thisMonth();
    st().addGroceryItem(form());
    st().setGroceryGot(mk, 'kale', true);
    expect(saved('grocery/main').items.map(i => i.id)).toEqual(['kale']);
    expect(saved(`grocery/${mk}`).lines.kale.got).toBe(true);
    useAppStore.setState({ grocery: { stores: [], items: [] }, groceryMonths: {} });
    st().loadGrocery();
    expect(st().grocery.items.map(i => i.id)).toEqual(['kale']);
    expect(st().groceryMonths[mk].lines.kale.got).toBe(true);
  });
  it('a month emptied again is removed from storage, not kept as an empty document', async () => {
    const mk = await thisMonth();
    st().addGroceryItem(form());
    st().setGroceryHave(mk, 'kale', true);
    expect(saved(`grocery/${mk}`)).not.toBeNull();
    st().setGroceryHave(mk, 'kale', false);
    expect(saved(`grocery/${mk}`)).toBeNull();
  });
  it('refuses to change the list until it has loaded, so an empty list never overwrites the saved one', () => {
    const ready = st().ready;
    useAppStore.setState({ ready: { ...ready, groc: false } });
    expect(st().addGroceryItem(form())).toMatch(/loading/i);
    expect(st().grocery.items).toEqual([]);
    expect(saved('grocery/main')).toBeNull();
    useAppStore.setState({ ready });
  });
  it('another tab\'s change to the list or a month is taken', async () => {
    const { fromOtherTab } = await import('./useAppStore.js');
    fromOtherTab({ key: 'ironlog:grocery/main', newValue: JSON.stringify({ stores: [], items: [{ id: 'rice', n: 'Rice', store: '', qty: 1, cents: null, every: true, out: false }] }) });
    expect(st().grocery.items.map(i => i.id)).toEqual(['rice']);
    fromOtherTab({ key: 'ironlog:grocery/2026-09', newValue: JSON.stringify({ lines: { rice: { got: true } }, pulled: [] }) });
    expect(st().groceryMonths['2026-09'].lines.rice.got).toBe(true);
    fromOtherTab({ key: 'ironlog:grocery/2026-09', newValue: null });
    expect(st().groceryMonths['2026-09']).toBeUndefined();
  });
  it('released to everyone (2026-10-13): a non-admin exports, backs up and imports the list too', async () => {
    const { setAdmin } = await import('../features.js');
    const { buildDataFile } = await import('../lib/export.js');
    st().addGroceryItem(form());
    setAdmin(false);
    expect(buildDataFile(st().snapshot(), {}).grocery.items.map(i => i.id)).toEqual(['kale']);
    useAppStore.setState({ importDraft: { name: 'x', kind: 'json', data: { exportedAt: '', config: {}, programs: {}, library: [], logs: {}, weeks: {}, body: [], experiments: [], stretches: null, stretchWeeks: {}, supplements: null, grocery: { stores: [], items: [{ id: 'rice', n: 'Rice', store: '', qty: 1, cents: null, every: true, out: false }], months: {} } } } });
    await st().applyImport('merge');
    expect(st().grocery.items.map(i => i.id).sort()).toEqual(['kale', 'rice']); // the file's rice is added
    setAdmin(true);
  });
});

// ADR 039: with a database (the host's, or the API's through the sync) the list is the account's.
function fakeDb() {
  const docs = new Map(); const listeners = [];
  const colOf = p => p.split('/')[0];
  const snap = l => (l.kind === 'col'
    ? { docs: [...docs].filter(([p]) => colOf(p) === l.name).map(([p, v]) => ({ id: p.slice(l.name.length + 1), exists: true, data: () => structuredClone(v) })) }
    : { exists: docs.has(l.name), data: () => structuredClone(docs.get(l.name)) });
  const notify = path => listeners.forEach(l => { if (l.kind === 'col' ? l.name === colOf(path) : l.name === path) l.cb(snap(l)); });
  const listen = (kind, name) => cb => { const l = { kind, name, cb }; listeners.push(l); cb(snap(l)); return () => {}; };
  const write = (path, fn) => { fn(); notify(path); return Promise.resolve(); };
  return {
    docs,
    collection: name => ({ onSnapshot: listen('col', name), get: async () => snap({ kind: 'col', name }) }),
    doc: path => ({ onSnapshot: listen('doc', path), get: async () => snap({ kind: 'doc', name: path }), set: data => write(path, () => docs.set(path, structuredClone(data))), delete: () => write(path, () => docs.delete(path)) }),
    remoteSet(path, data) { if (data == null) docs.delete(path); else docs.set(path, structuredClone(data)); notify(path); },
  };
}
const tick = () => new Promise(r => setTimeout(r, 0));
const item = (id, n, over = {}) => ({ id, n, store: '', qty: 1, cents: null, every: true, out: false, ...over });

describe('the list in the account (ADR 039)', () => {
  // A fresh store on a database; `device` is the list this browser held before the list synced.
  async function boot(fdb, device = {}) {
    vi.resetModules();
    clearStorage();
    for (const [path, doc] of Object.entries(device)) mem['ironlog:' + path] = JSON.stringify(doc);
    globalThis.claude = { use: async n => (n === 'db' ? fdb : null) };
    const mod = await import('./useAppStore.js');
    await mod.useAppStore.getState().init(); await tick();
    return mod;
  }
  const done = () => { delete globalThis.claude; };

  it('loads from the database, writes there and not to this browser\'s storage, and takes another device\'s change', async () => {
    const fdb = fakeDb();
    fdb.docs.set('grocery/main', { stores: [], items: [item('kale', 'Kale')] });
    fdb.docs.set('grocery/2026-09', { lines: { kale: { got: true } }, pulled: [] });
    try {
      const { useAppStore: S } = await boot(fdb);
      const s = () => S.getState();
      expect(s().isReady()).toBe(true);
      expect(s().grocery.items.map(i => i.id)).toEqual(['kale']);
      expect(s().groceryMonths['2026-09'].lines.kale.got).toBe(true);
      expect(s().addGroceryItem(form({ n: 'Rice', store: '' }))).toBeNull();
      await tick();
      expect(fdb.docs.get('grocery/main').items.map(i => i.id)).toEqual(['rice', 'kale']); // the new item goes on top
      expect(mem['ironlog:grocery/main']).toBeUndefined();
      fdb.remoteSet('grocery/2026-09', { lines: { kale: { got: true }, rice: { got: true } }, pulled: [] }); // ticked on another device
      expect(s().groceryMonths['2026-09'].lines.rice.got).toBe(true);
      fdb.remoteSet('grocery/2026-09', null);
      expect(s().groceryMonths['2026-09']).toBeUndefined();
    } finally { done(); }
  });

  it('the list this browser held before syncing reaches the account once, added to what is there, nothing doubled', async () => {
    const fdb = fakeDb();
    fdb.docs.set('grocery/main', { stores: ['Aldi'], items: [item('kale', 'Kale', { store: 'Aldi' })] }); // the account has a list already
    fdb.docs.set('grocery/2026-09', { lines: { kale: { got: true } }, pulled: [] });
    const device = {
      'grocery/main': { stores: ['Aldi'], items: [item('kale', 'Kale', { store: 'Aldi', qty: 5 }), item('salt', 'Salt', { once: true, every: undefined })] },
      'grocery/2026-09': { lines: { kale: { got: true, cents: 1 }, salt: { got: true } }, pulled: [] },
      'grocery/2026-08': { lines: { salt: { got: true } }, pulled: [] },
    };
    try {
      const { useAppStore: S } = await boot(fdb, device);
      await tick();
      expect(fdb.docs.get('grocery/main').items.map(i => [i.id, i.qty])).toEqual([['kale', 1], ['salt', 1]]); // the account's kale stays; salt is added
      expect(fdb.docs.get('grocery/2026-09').lines).toEqual({ kale: { got: true }, salt: { got: true } }); // the account's line wins
      expect(fdb.docs.get('grocery/2026-08').lines).toEqual({ salt: { got: true } });
      expect(saved('sync/grocery-adopted')).toMatchObject({ why: 'added' });
      expect(saved('grocery/main')).not.toBeNull(); // the device's copy is kept, as with the other old documents
      expect(S.getState().grocery.items).toHaveLength(2);
      // the account's list is then emptied on another device; reopening does not fill it again from here
      fdb.remoteSet('grocery/main', { stores: [], items: [] });
      vi.resetModules();
      const again = await import('./useAppStore.js');
      await again.useAppStore.getState().init(); await tick();
      expect(fdb.docs.get('grocery/main').items).toEqual([]);
    } finally { done(); }
  });

  it('a device handed to another account never adds its old list to it', async () => {
    const fdb = fakeDb();
    try {
      mem['ironlog:sync/grocery-adopted'] = JSON.stringify({ why: 'other-account' });
      vi.resetModules();
      globalThis.claude = { use: async n => (n === 'db' ? fdb : null) };
      mem['ironlog:grocery/main'] = JSON.stringify({ stores: [], items: [item('kale', 'Kale')] });
      const { useAppStore: S } = await import('./useAppStore.js');
      await S.getState().init(); await tick();
      expect(fdb.docs.has('grocery/main')).toBe(false);
      expect(S.getState().grocery.items).toEqual([]);
    } finally { done(); }
  });
});
