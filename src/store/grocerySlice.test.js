import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage, saved, mem } from '../test/browserStubs.js';

let useAppStore; const st = () => useAppStore.getState();
const form = (o = {}) => ({ n: 'Kale', store: 'Veg market', qty: '2', price: '2.50', once: false, ...o });
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
