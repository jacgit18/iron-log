import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

// Code audit M-04: removing an item that was bought leaves its purchase in its month, at the store it was bought at and split as it was counted,
// so the store's tax and what the others owe do not vanish. Undo puts the item back and takes the pins off again.
let useAppStore; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { setAdmin } = await import('../features.js'); setAdmin(true);
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
});

const setup = async (price = '10.00') => {
  const lib = await import('../lib/grocery.js'); const settle = await import('../lib/grocerySettle.js');
  st().addGroceryItem({ n: 'Milk', store: 'Aldi', qty: '1', price, every: true });
  st().addGroceryGroup('Home', ['Sis']);
  const gid = st().grocery.groups[0].id; const sis = st().grocery.groups[0].people[0].id;
  st().setGroceryStoreGroup('Aldi', gid);
  const id = st().grocery.items[0].id; const mk = lib.monthKey(new Date());
  st().setGroceryGot(mk, id, true); st().setGroceryTax(mk, 'Aldi', 80);
  const m = () => st().groceryMonths[mk];
  const money = () => ({ ...settle.monthShare(st().grocery, m()), ...settle.monthOwes(st().grocery, m()), spent: lib.spendByMonth(st().grocery, st().groceryMonths, mk, 1)[0].spent });
  return { lib, id, mk, sis, m, money };
};

describe('removing an item bought this month', () => {
  it('keeps the store tax and the split: spend, your share and what is owed stay as they were', async () => {
    const { id, money } = await setup();
    expect(money()).toMatchObject({ spent: 1080, yours: 540, owed: 540 });
    st().removeGroceryItem(id);
    expect(st().grocery.items).toHaveLength(0);
    expect(money()).toMatchObject({ spent: 1080, yours: 540, owed: 540 });
  });
  it('pins the store and the split on the line, and the pins stay when the removal is undone (they are what it was bought with)', async () => {
    const { id, m, sis, money } = await setup();
    st().removeGroceryItem(id);
    expect(m().lines[id]).toMatchObject({ got: true, store: 'Aldi', share: { with: [sis] } });
    st().undoRemoved(); // the Undo the notice offers
    expect(st().grocery.items.map(i => i.n)).toEqual(['Milk']);
    expect(m().lines[id]).toEqual({ got: true, qty: 1, cents: 1000, store: 'Aldi', share: { with: [sis] } });
    expect(money()).toMatchObject({ spent: 1080, yours: 540, owed: 540 });
  });
  it('keeps an item’s own split and a store it was moved to for the month, and touches no month where it was not bought', async () => {
    const { lib, id, mk, sis, m } = await setup();
    st().setGroceryItemShare(id, { with: [sis], notMine: true });
    st().addGroceryStore('Lidl'); st().setGroceryLineStore(mk, id, 'Lidl');
    const last = lib.shiftMonth(mk, -1);
    st().setGroceryHave(last, id, true); // had last month, not bought
    st().removeGroceryItem(id);
    expect(m().lines[id].store).toBe('Lidl');
    expect(m().lines[id].share).toEqual({ with: [sis], notMine: true });
    expect(st().groceryMonths[last].lines[id]).toEqual({ have: true });
  });
  it('keeps a pack-priced line as one purchase per pack, each with its own split', async () => {
    const { id, mk, money } = await setup('');
    st().setGroceryPrices(mk, id, [500, 700]);
    st().setGroceryPackShare(mk, id, 0, { with: [] });
    st().removeGroceryItem(id);
    expect(money()).toMatchObject({ spent: 1280, owed: 373 }); // pack 1 ($5) is yours alone, pack 2 ($7) is split with Sis: $3.50 plus $0.23 of the $0.80 tax, shared by what each came to
  });
  it('with no group and no split a removed item is still yours alone, as before', async () => {
    const lib = await import('../lib/grocery.js'); const settle = await import('../lib/grocerySettle.js');
    st().addGroceryItem({ n: 'Rice', store: 'Aldi', qty: '1', price: '5.00', every: true });
    const id = st().grocery.items[0].id; const mk = lib.monthKey(new Date());
    st().setGroceryGot(mk, id, true);
    st().removeGroceryItem(id);
    expect(st().groceryMonths[mk].lines[id].share).toEqual({ with: [] });
    expect(settle.monthShare(st().grocery, st().groceryMonths[mk])).toMatchObject({ yours: 500 });
  });
});

describe('edges of removing an item (independent review of M-04)', () => {
  it('keeps the month’s own store when it was removed afterwards (retired), and pins it with the removed item', async () => {
    const { id, mk, m, money } = await setup();
    st().addGroceryStore('Lidl'); st().setGroceryLineStore(mk, id, 'Lidl');
    st().removeGroceryStore('Lidl'); // allowed: no item has Lidl as its usual store; this month still bought it there, so it is retired, not forgotten
    expect(st().grocery.retired).toEqual(['Lidl']);
    const before = money();
    st().removeGroceryItem(id);
    expect(m().lines[id].store).toBe('Lidl');
    expect(money()).toEqual(before);
  });
  it('pins "just you" when there is no group or split, so a group made later does not reach back to the removed item', async () => {
    const lib = await import('../lib/grocery.js'); const settle = await import('../lib/grocerySettle.js');
    st().addGroceryItem({ n: 'Rice', store: 'Aldi', qty: '1', price: '5.00', every: true });
    const id = st().grocery.items[0].id; const mk = lib.monthKey(new Date());
    st().setGroceryGot(mk, id, true); st().removeGroceryItem(id);
    expect(st().groceryMonths[mk].lines[id].share).toEqual({ with: [] });
    st().addGroceryGroup('Home', ['Sis']); st().setGroceryStoreGroup('Aldi', st().grocery.groups[0].id);
    expect(settle.monthOwes(st().grocery, st().groceryMonths[mk])).toMatchObject({ owed: 0 });
  });
  it('gives a new item with the name of a removed one an id of its own, so it does not inherit the removed item’s purchases', async () => {
    const { id, mk, m } = await setup();
    st().removeGroceryItem(id);
    st().addGroceryItem({ n: 'Milk', store: 'Lidl', qty: '1', price: '4.00', every: true });
    const fresh = st().grocery.items[0];
    expect(fresh.id).not.toBe(id);
    expect(m().lines[fresh.id]).toBeUndefined();
    expect(st().groceryMonths[mk].lines[id]).toMatchObject({ got: true, store: 'Aldi' }); // the removed item's purchase is still its own
  });
});
