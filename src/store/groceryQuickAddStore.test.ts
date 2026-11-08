import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';
import { findQuickAdded, quickAddForm } from '../lib/groceryQuickAdd.js';

// Quick add on Shopping goes through addGroceryItem: a one-time item (When out, out), refused by the same rules as the Inventory add form.
let useAppStore: typeof import('./useAppStore.js').useAppStore; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
  st().addGroceryStore('Aldi');
});

describe('quick add through addGroceryItem', () => {
  it('creates a When-out item that is out, in that store, and an ordinary add stays Every month', () => {
    expect(st().addGroceryItem(quickAddForm('Milk', 'Aldi'))).toBeNull();
    expect(findQuickAdded(st().grocery.items, 'Milk', 'Aldi')).toMatchObject({ n: 'Milk', store: 'Aldi', qty: 1, cents: null, every: false, out: true });
    expect(st().addGroceryItem({ n: 'Rice', store: 'Aldi', qty: '1', price: '', every: false })).toBeNull();
    expect(findQuickAdded(st().grocery.items, 'Rice', 'Aldi')).toMatchObject({ every: true, out: false });
  });
  it('Undo removes it', () => {
    st().addGroceryItem(quickAddForm('Milk', 'Aldi'));
    const id = findQuickAdded(st().grocery.items, 'Milk', 'Aldi')!.id;
    st().removeGroceryItem(id, { quiet: true });
    expect(st().grocery.items.some(i => i.id === id)).toBe(false);
  });
  it('refuses a duplicate name in the store and an empty name with the existing messages', () => {
    st().addGroceryItem(quickAddForm('Milk', 'Aldi'));
    expect(st().addGroceryItem(quickAddForm('milk', 'Aldi'))).toBe('That item is already in this store’s list.');
    expect(st().addGroceryItem(quickAddForm('  ', 'Aldi'))).toBe('Give the item a name.');
  });
  it('the same name in another store is allowed', () => {
    st().addGroceryStore('Lidl');
    st().addGroceryItem(quickAddForm('Milk', 'Aldi'));
    expect(st().addGroceryItem(quickAddForm('Milk', 'Lidl'))).toBeNull();
  });
});

// Brief quickadd-one-time-items: the marker, what it hides, and that nothing is deleted.
describe('one-time items', () => {
  it('quick add marks the item one-time and an ordinary add does not', () => {
    st().addGroceryItem(quickAddForm('Milk', 'Aldi'));
    st().addGroceryItem({ n: 'Rice', store: 'Aldi', qty: '1', price: '', every: false });
    expect(findQuickAdded(st().grocery.items, 'Milk', 'Aldi')?.oneTime).toBe(true);
    expect(findQuickAdded(st().grocery.items, 'Rice', 'Aldi')?.oneTime).toBeUndefined();
  });
  it('buying it hides it from Inventory and later months but keeps it, and unticking brings it back', async () => {
    const { usedOneTime, withoutUsed } = await import('../lib/grocery.js');
    st().addGroceryItem(quickAddForm('Milk', 'Aldi'));
    const id = findQuickAdded(st().grocery.items, 'Milk', 'Aldi')!.id;
    st().setGroceryGot('2026-11', id, true);
    expect(usedOneTime(st().grocery, st().groceryMonths).has(id)).toBe(true);
    expect(withoutUsed(st().grocery, st().groceryMonths).items.some(i => i.id === id)).toBe(false);
    expect(st().grocery.items.some(i => i.id === id)).toBe(true); // nothing deleted
    st().setGroceryGot('2026-11', id, false);
    expect(withoutUsed(st().grocery, st().groceryMonths).items.some(i => i.id === id)).toBe(true);
  });
  it('the same name can be quick-added again once the first one is used', () => {
    st().addGroceryItem(quickAddForm('Milk', 'Aldi'));
    const id = findQuickAdded(st().grocery.items, 'Milk', 'Aldi')!.id;
    expect(st().addGroceryItem(quickAddForm('Milk', 'Aldi'))).toBe('That item is already in this store’s list.');
    st().setGroceryGot('2026-11', id, true);
    expect(st().addGroceryItem(quickAddForm('Milk', 'Aldi'))).toBeNull();
    expect(st().grocery.items.filter(i => i.n === 'Milk')).toHaveLength(2);
  });
  it('the Edit box switches any item to one-time and back', () => {
    st().addGroceryItem({ n: 'Rice', store: 'Aldi', qty: '1', price: '', every: false });
    const id = findQuickAdded(st().grocery.items, 'Rice', 'Aldi')!.id;
    expect(st().updateGroceryItem(id, { oneTime: true })).toBeNull();
    expect(st().grocery.items.find(i => i.id === id)?.oneTime).toBe(true);
    expect(st().updateGroceryItem(id, { oneTime: false })).toBeNull();
    expect(st().grocery.items.find(i => i.id === id)?.oneTime).toBeUndefined();
  });
});
