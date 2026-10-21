import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

// Audit U-5: a tick that did nothing (sync still loading) must say so, so the screen does not show an Undo notice for it.
let useAppStore; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
});

describe('setGroceryGot says whether it took effect', () => {
  it('returns true when it ticked and false for a missing item', async () => {
    const { monthKey } = await import('../lib/grocery.js');
    st().addGroceryItem({ n: 'Milk', store: '', qty: '1', price: '', every: true });
    const id = st().grocery.items[0].id; const mk = monthKey(new Date());
    expect(st().setGroceryGot(mk, id, true)).toBe(true);
    expect(st().setGroceryGot(mk, 'nope', true)).toBe(false);
  });
  it('returns false and changes nothing while the data is still loading', async () => {
    const { monthKey } = await import('../lib/grocery.js');
    st().addGroceryItem({ n: 'Milk', store: '', qty: '1', price: '', every: true });
    const id = st().grocery.items[0].id; const mk = monthKey(new Date());
    const ready = st().ready;
    useAppStore.setState({ ready: Object.fromEntries(Object.keys(ready).map(k => [k, false])) });
    try {
      expect(st().setGroceryGot(mk, id, true)).toBe(false);
      expect(st().groceryMonths[mk]).toBeUndefined();
    } finally { useAppStore.setState({ ready }); }
  });
});
