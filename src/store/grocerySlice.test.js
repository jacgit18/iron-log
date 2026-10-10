import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage, saved } from '../test/browserStubs.js';

let useAppStore; const st = () => useAppStore.getState();
const form = (o = {}) => ({ n: 'Kale', store: 'Veg market', qty: '2', price: '2.50', once: false, ...o });
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
});
const thisMonth = async () => (await import('../lib/grocery.js')).monthKey(new Date());

describe('the catalogue', () => {
  it('adds an item with its store, count and price, and saves it on the device', () => {
    expect(st().addGroceryItem(form())).toBeNull();
    expect(st().grocery.items).toEqual([{ id: 'kale', n: 'Kale', store: 'Veg market', qty: 2, cents: 250, once: false }]);
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
  it('pulls an occasional item onto one month and takes it off again', async () => {
    const mk = await thisMonth();
    st().addGroceryItem(form({ n: 'Saffron', once: true }));
    st().addGroceryItem(form({ n: 'Rice' }));
    st().pullGrocery(mk, 'rice', true); // not occasional: no effect
    expect(st().groceryMonths).toEqual({});
    st().pullGrocery(mk, 'saffron', true);
    expect(st().groceryMonths[mk].pulled).toEqual(['saffron']);
    st().setGroceryGot(mk, 'saffron', true);
    st().pullGrocery(mk, 'saffron', false);
    expect(st().groceryMonths[mk]).toBeUndefined(); // empty again: nothing kept
    expect(saved('grocery/' + mk)).toBeNull();
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
    st().setGrocery({ stores: ['Costco'], items: [{ id: 'rice', n: 'Rice', store: 'Costco', qty: 1, cents: 100, once: false }] }, { '2026-01': { lines: { rice: { got: true } }, pulled: [] }, nope: { lines: {} } });
    expect(st().grocery.items.map(i => i.id)).toEqual(['rice']);
    expect(Object.keys(st().groceryMonths)).toEqual(['2026-01']);
    expect(saved('grocery/' + mk)).toBeNull();
    expect(saved('grocery/2026-01').lines.rice.got).toBe(true);
  });
});
