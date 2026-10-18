import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage, saved } from '../test/browserStubs.js';

let useAppStore; const st = () => useAppStore.getState();
const form = (o = {}) => ({ n: 'Chicken', store: '', qty: '2.4', price: '6.25', every: true, ...o });
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { setAdmin } = await import('../features.js'); setAdmin(true);
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
});

describe('selling by weight', () => {
  it('adds an item by the lb with a weight and a price per lb, and a total that follows', async () => {
    expect(st().addGroceryItem(form({ unit: 'lb' }))).toBeNull();
    const it = st().grocery.items[0];
    expect(it).toMatchObject({ qty: 2.4, cents: 625, unit: 'lb' });
    expect(saved('grocery/main').items[0].unit).toBe('lb');
    const { lineTotal } = await import('../lib/grocery.js');
    expect(lineTotal(it.qty, it.cents)).toBe(1500); // 2.4 lb at $6.25 is $15.00
  });
  it('changes and clears the unit; an unknown unit clears it too, and each leaves no key', () => {
    st().addGroceryItem(form());
    expect('unit' in st().grocery.items[0]).toBe(false);
    st().updateGroceryItem('chicken', { unit: 'kg' });
    expect(st().grocery.items[0].unit).toBe('kg');
    st().updateGroceryItem('chicken', { unit: 'oz' });
    expect(st().grocery.items[0].unit).toBe('oz');
    st().updateGroceryItem('chicken', { unit: '' });
    expect('unit' in st().grocery.items[0]).toBe(false);
  });
});
