import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

// Code audit G-3 / M-06: removing a store that a past month still uses retires it instead of forgetting it.
let useAppStore; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
});

const setup = async () => {
  const lib = await import('../lib/grocery.js');
  st().addGroceryItem({ n: 'Milk', store: 'Aldi', qty: '1', price: '4.40', every: true });
  const id = st().grocery.items[0].id; const mk = lib.monthKey(new Date()); const last = lib.shiftMonth(mk, -1);
  const spent = (key) => lib.spendByMonth(st().grocery, st().groceryMonths, mk, 2).find(r => r.key === key).spent;
  return { lib, id, mk, last, spent };
};

describe('removing a store that history uses', () => {
  it('retires it, and last month still reads the same', async () => {
    const { id, last, spent } = await setup();
    st().setGroceryGot(last, id, true);
    expect(spent(last)).toBe(440);
    st().removeGroceryItem(id);
    expect(st().removeGroceryStore('Aldi')).toBeNull();
    expect(st().grocery.stores).not.toContain('Aldi');
    expect(st().grocery.retired).toEqual(['Aldi']);
    expect(spent(last)).toBe(440);
  });
  it('deletes it outright when no month uses it', async () => {
    await setup();
    st().removeGroceryItem(st().grocery.items[0].id);
    st().removeGroceryStore('Aldi');
    expect(st().grocery.retired).toBeUndefined();
  });
  it('brings it back when a store of that name is added again', async () => {
    const { id, last } = await setup();
    st().setGroceryGot(last, id, true);
    st().removeGroceryItem(id); st().removeGroceryStore('Aldi');
    expect(st().addGroceryStore('aldi')).toBeNull();
    expect(st().grocery.stores).toContain('Aldi');
    expect(st().grocery.retired).toBeUndefined();
  });
  it('brings it back when an item is added to it, instead of a second copy', async () => {
    const { id, last } = await setup();
    st().setGroceryGot(last, id, true);
    st().removeGroceryItem(id); st().removeGroceryStore('Aldi');
    st().addGroceryItem({ n: 'Eggs', store: 'aldi', qty: '1', price: '', every: true });
    expect(st().grocery.stores).toEqual(['Aldi']);
    expect(st().grocery.retired).toBeUndefined();
  });
  it('Undo puts it back as live', async () => {
    const { id, last } = await setup();
    st().setGroceryGot(last, id, true);
    st().removeGroceryItem(id); st().removeGroceryStore('Aldi');
    st().undoRemoved();
    expect(st().grocery.stores).toContain('Aldi');
    expect(st().grocery.retired).toBeUndefined();
  });
});

describe('retired stores in saved data and sync', () => {
  it('normGrocery keeps unique names that are not live', async () => {
    const { normGrocery } = await import('../lib/grocery.js');
    const g = normGrocery({ stores: ['Lidl'], items: [], retired: ['Aldi', 'Aldi', 'Lidl', 7] });
    expect(g.retired).toEqual(['Aldi']);
  });
  it('round-trips through the sync rows', async () => {
    const { normGroceryStore, validGroceryStore } = await import('../shared/grocery.js');
    expect(validGroceryStore({ id: 'Aldi', n: 'Aldi', retired: true })).toBe(true);
    expect(validGroceryStore({ id: 'Aldi', n: 'Aldi', retired: 'yes' })).toBe(false);
    expect(normGroceryStore({ id: 'Aldi', n: 'Aldi', retired: true })).toEqual({ id: 'Aldi', n: 'Aldi', retired: true });
    expect(normGroceryStore({ id: 'Aldi', n: 'Aldi' })).toEqual({ id: 'Aldi', n: 'Aldi' });
  });
});
