import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

// Code audit M-02: changing an item's usual store must not rewrite the months it was already bought in (their bill, their store's tax, who paid).
let useAppStore; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
});

const setup = async () => {
  const lib = await import('../lib/grocery.js');
  st().addGroceryItem({ n: 'Milk', store: 'Aldi', qty: '1', price: '4.00', every: true });
  const id = st().grocery.items[0].id; const mk = lib.monthKey(new Date()); const last = lib.shiftMonth(mk, -1);
  st().setGroceryGot(last, id, true); st().setGroceryTax(last, 'Aldi', 40);
  return { lib, id, mk, last };
};

describe('changing the usual store of a bought item', () => {
  it('leaves last month bought at the old store, with its tax', async () => {
    const { lib, id, last } = await setup();
    expect(st().updateGroceryItem(id, { store: 'Whole Foods' })).toBeNull();
    const item = st().grocery.items[0]; const m = st().groceryMonths[last];
    expect(item.store).toBe('Whole Foods');
    expect(lib.storeFor(st().grocery, item, m)).toBe('Aldi');
    expect(lib.tally(lib.inMonth(st().grocery, st().grocery.items, m), m).spent).toBe(440);
  });
  it('does the same when the new store is made the usual from the item sheet', async () => {
    const { lib, id, mk, last } = await setup();
    st().addGroceryStore('Costco');
    st().setGroceryLineStore(mk, id, 'Costco');
    expect(st().makeGroceryStoreUsual(mk, id)).toBeNull();
    expect(st().grocery.items[0].store).toBe('Costco');
    expect(lib.storeFor(st().grocery, st().grocery.items[0], st().groceryMonths[last])).toBe('Aldi');
  });
  it('does not pin a month where the item was not bought, or a line that already has its own store', async () => {
    const { id, mk, last } = await setup();
    st().setGroceryHave(mk, id, true); // this month: had, not bought
    st().addGroceryStore('Costco'); st().setGroceryLineStore(last, id, 'Costco');
    st().updateGroceryItem(id, { store: 'Whole Foods' });
    expect(st().groceryMonths[mk].lines[id].store).toBeUndefined();
    expect(st().groceryMonths[last].lines[id].store).toBe('Costco');
  });
  it('changes nothing in the past when only the name or price is edited', async () => {
    const { id, last } = await setup();
    st().updateGroceryItem(id, { n: 'Milk 2%', cents: 500 });
    expect(st().groceryMonths[last].lines[id].store).toBeUndefined();
  });
});
