import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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
  it('unchecking Have puts a When-out item on this month’s list; an Every-month item is never out', async () => {
    st().addGroceryItem(form({ n: 'Saffron', every: false }));
    st().addGroceryItem(form({ n: 'Rice' }));
    expect(st().grocery.items.map(i => [i.id, i.every, i.out])).toEqual([['saffron', false, false], ['rice', true, false]]);
    st().setGroceryOut('saffron', true);
    st().setGroceryOut('rice', true); // no effect
    expect(st().grocery.items.map(i => i.out)).toEqual([true, false]);
    expect(saved('grocery/main').items[0].out).toBe(true);
    expect(st().groceryMonths).toEqual({}); // nothing stored for the month: being out is the catalogue's
    st().updateGroceryItem('saffron', { every: true });
    expect(st().grocery.items[0]).toMatchObject({ every: true, out: false }); // made Every month: no longer out
  });
  it('closes the loop: buying a When-out item this month means you have it again, and unticking puts it back to out', async () => {
    const mk = await thisMonth();
    st().addGroceryItem(form({ n: 'Saffron', every: false }));
    st().setGroceryOut('saffron', true);
    st().setGroceryGot(mk, 'saffron', true);
    expect(st().grocery.items[0].out).toBe(false);
    expect(st().groceryMonths[mk].lines.saffron.got).toBe(true);
    st().setGroceryGot(mk, 'saffron', false);
    expect(st().grocery.items[0].out).toBe(true);
  });
  it('leaves what is at home alone when ticking in another month, or ticking an Every-month item', async () => {
    const mk = await thisMonth(); const { shiftMonth } = await import('../lib/grocery.js');
    st().addGroceryItem(form({ n: 'Saffron', every: false }));
    st().addGroceryItem(form({ n: 'Rice' }));
    st().setGroceryOut('saffron', true);
    st().setGroceryGot(shiftMonth(mk, -1), 'saffron', true);
    expect(st().grocery.items[0].out).toBe(true);
    st().setGroceryGot(mk, 'rice', true);
    st().setGroceryGot(mk, 'rice', false);
    expect(st().grocery.items[1]).toMatchObject({ every: true, out: false });
  });
  it('takes a When-out item off the list: not out, and nothing of it left on that month', async () => {
    const mk = await thisMonth();
    st().addGroceryItem(form({ n: 'Saffron', every: false }));
    st().addGroceryItem(form({ n: 'Rice' }));
    st().setGroceryOut('saffron', true);
    st().setGroceryQty(mk, 'saffron', 3);
    st().takeGroceryOff(mk, 'rice'); // Every month: no effect
    expect(st().grocery.items[1].out).toBe(false);
    st().takeGroceryOff(mk, 'saffron');
    expect(st().grocery.items[0].out).toBe(false);
    expect(st().groceryMonths[mk]).toBeUndefined(); // empty again: nothing kept
    expect(saved('grocery/' + mk)).toBeNull();
  });
  it('taking an item off an older month leaves it out today', async () => {
    const mk = await thisMonth(); const { shiftMonth } = await import('../lib/grocery.js'); const last = shiftMonth(mk, -1);
    st().addGroceryItem(form({ n: 'Saffron', every: false }));
    st().setGroceryOut('saffron', true);
    st().setGroceryGot(last, 'saffron', true);
    st().takeGroceryOff(last, 'saffron');
    expect(st().groceryMonths[last]).toBeUndefined(); // last month's purchase is gone
    expect(st().grocery.items[0].out).toBe(true); // still on this month's To get
  });
  it('takes off an item an older version pulled onto a month', async () => {
    const mk = await thisMonth();
    st().addGroceryItem(form({ n: 'Saffron', every: false }));
    useAppStore.setState({ groceryMonths: { [mk]: { lines: {}, pulled: ['saffron'] } } });
    st().takeGroceryOff(mk, 'saffron');
    expect(st().groceryMonths[mk]).toBeUndefined();
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
    expect(st().grocery.items.map(i => [i.id, i.qty])).toEqual([['kale', 7], ['rice', 1]]);
    expect(st().groceryMonths[mk].lines.kale.got).toBeUndefined(); // the line here (unticked) stays; the file's tick does not override it
  });
  it('a file with no list leaves the data file without a grocery part', async () => {
    const { buildDataFile } = await import('../lib/export.js');
    expect('grocery' in buildDataFile(st().snapshot(), {})).toBe(false);
  });
});

describe('who sees and keeps the list', () => {
  it('forgets the list, here and in storage, when the device goes to another account', async () => {
    const mk = await thisMonth();
    st().addGroceryItem(form());
    st().setGroceryGot(mk, 'kale', true);
    expect(saved('grocery/main')).not.toBeNull();
    st().clearGrocery();
    expect(st().grocery.items).toEqual([]);
    expect(st().groceryMonths).toEqual({});
    expect(Object.keys(mem).filter(k => k.startsWith('ironlog:grocery/'))).toEqual([]);
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
