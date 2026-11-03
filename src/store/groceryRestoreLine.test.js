import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

// restoreGroceryLine (brief receipt-scan): Undo after a receipt is applied puts one month line back exactly as it was.
let useAppStore; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
});
const setup = async () => {
  const lib = await import('../lib/grocery.js');
  st().addGroceryItem({ n: 'Eggs', store: 'Aldi', qty: '1', price: '', every: true });
  return { id: st().grocery.items[0].id, mk: lib.monthKey(new Date()) };
};

describe('restoreGroceryLine', () => {
  it('puts back a line that existed, with its pack prices and shares', async () => {
    const { id, mk } = await setup();
    const before = { got: true, prices: [1349, 1199], packShares: [{ with: ['p1'] }, null] };
    st().restoreGroceryLine(mk, id, before);
    expect(st().groceryMonths[mk].lines[id]).toEqual(before);
    st().setGroceryCents(mk, id, 500); // a later change, as Apply would make
    st().restoreGroceryLine(mk, id, before);
    expect(st().groceryMonths[mk].lines[id]).toEqual(before);
  });
  it('removes the line when it had none', async () => {
    const { id, mk } = await setup();
    st().setGroceryGot(mk, id, true);
    expect(st().groceryMonths[mk].lines[id]).toBeTruthy();
    st().restoreGroceryLine(mk, id, null);
    expect(st().groceryMonths[mk]?.lines[id]).toBeUndefined();
    st().restoreGroceryLine(mk, id, {}); // an empty line is no line
    expect(st().groceryMonths[mk]?.lines[id]).toBeUndefined();
  });
  it('changes nothing for an item the list does not have or a bad month', async () => {
    const { id, mk } = await setup();
    st().setGroceryGot(mk, id, true);
    const kept = JSON.stringify(st().groceryMonths);
    st().restoreGroceryLine(mk, 'no-such-item', { got: true });
    st().restoreGroceryLine('not-a-month', id, null);
    expect(JSON.stringify(st().groceryMonths)).toBe(kept);
  });
  it('does not write while sync is still loading', async () => {
    const { id, mk } = await setup();
    st().setGroceryGot(mk, id, true);
    const kept = JSON.stringify(st().groceryMonths);
    const ready = st().isReady;
    useAppStore.setState({ isReady: () => false });
    try { st().restoreGroceryLine(mk, id, null); } finally { useAppStore.setState({ isReady: ready }); }
    expect(JSON.stringify(st().groceryMonths)).toBe(kept);
  });
});
