import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

// Closing audit 2: N-1 (removing a store pins past splits) and N-10 (a retired store stays retired when an item names it).
let useAppStore; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { setAdmin } = await import('../features.js'); setAdmin(true);
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
});

describe('N-1: removing a store keeps last month’s split', () => {
  const setup = async () => {
    const lib = await import('../lib/grocery.js'); const settle = await import('../lib/grocerySettle.js');
    st().addGroceryItem({ n: 'Milk', store: 'Aldi', qty: '1', price: '10.00', every: true });
    st().addGroceryGroup('Home', ['Bob']);
    st().setGroceryStoreGroup('Aldi', st().grocery.groups[0].id);
    const milk = st().grocery.items[0].id; const mk = lib.monthKey(new Date()); const last = lib.shiftMonth(mk, -1);
    st().setGroceryGot(last, milk, true);
    const share = () => settle.monthShare(st().grocery, st().groceryMonths[last]);
    return { milk, last, share, settle };
  };
  it('does not rewrite the split, and Undo still works', async () => {
    const { milk, share } = await setup();
    expect(share()).toMatchObject({ paid: 1000, yours: 500 });
    st().updateGroceryItem(milk, { store: 'Lidl' });
    expect(st().grocery.items[0].store).toBe('Lidl');
    expect(st().removeGroceryStore('Aldi')).toBeNull();
    expect(share()).toMatchObject({ paid: 1000, yours: 500 });
    expect(st().grocery.groups[0].stores).not.toContain('Aldi');
    st().undoRemoved();
    expect(st().grocery.stores).toContain('Aldi');
    expect(st().grocery.groups[0].stores).toContain('Aldi');
    expect(share()).toMatchObject({ paid: 1000, yours: 500 });
  });
});

describe('N-10: a retired store stays retired when an item names it', () => {
  it('normGrocery keeps it retired and not live', async () => {
    const { normGrocery } = await import('../lib/grocery.js');
    const g = normGrocery({ stores: ['Lidl'], retired: ['Aldi'], items: [{ id: 'a', n: 'Milk', store: 'Aldi', qty: 1, cents: 100, every: true }] });
    expect(g.stores).toEqual(['Lidl']);
    expect(g.retired).toEqual(['Aldi']);
    expect(g.items[0].store).toBe('Aldi');
  });
  it('still adds a store only an item names', async () => {
    const { normGrocery } = await import('../lib/grocery.js');
    const g = normGrocery({ stores: [], items: [{ id: 'a', n: 'Milk', store: 'Aldi', qty: 1, cents: 100, every: true }] });
    expect(g.stores).toEqual(['Aldi']);
  });
});
