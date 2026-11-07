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
  it('Make it every month changes it, Undo removes it', () => {
    st().addGroceryItem(quickAddForm('Milk', 'Aldi'));
    const id = findQuickAdded(st().grocery.items, 'Milk', 'Aldi')!.id;
    expect(st().updateGroceryItem(id, { every: true })).toBeNull();
    expect(st().grocery.items.find(i => i.id === id)).toMatchObject({ every: true, out: false });
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
