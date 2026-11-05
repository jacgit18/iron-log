import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

// Bulk share (brief grocery-bulk-share) through the real store actions: Apply sets the lines, leaves the usual splits alone unless asked, drops pack shares, and Undo restores everything.
let useAppStore: typeof import('./useAppStore.js').useAppStore;
const st = () => useAppStore.getState();
let lib: typeof import('../lib/grocery.js');
let bulk: typeof import('../lib/groceryBulkShare.js');
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); lib = await import('../lib/grocery.js'); bulk = await import('../lib/groceryBulkShare.js'); await st().init(); });
const idOf = (n: string) => st().grocery.items.find(i => i.n === n)!.id;
const mk = () => lib.monthKey(new Date());
let SAM = '';
beforeEach(() => {
  clearStorage();
  useAppStore.setState({ grocery: lib.normGrocery(null), groceryMonths: {} });
  st().addGroceryStore('Costco');
  st().addGroceryItem({ n: 'Eggs', store: 'Costco', qty: '1', price: '5', every: true });
  st().addGroceryItem({ n: 'Beef', store: 'Costco', qty: '1', price: '9', every: true });
  st().addGroceryItem({ n: 'Rice', store: 'Costco', qty: '1', price: '7', every: true });
  const gid = st().addGroceryGroup('Home', ['Sam'])!;
  st().setGroceryStoreGroup('Costco', gid);
  SAM = st().grocery.groups![0]!.people[0]!.id;
});
const run = (ids: string[], share: Parameters<typeof bulk.applyBulkShare>[3], usual: boolean) => {
  const s = st();
  const snap = bulk.takeShareSnapshot(mk(), ids, s.groceryMonths[mk()]?.lines ?? {}, s.grocery.items);
  const n = bulk.applyBulkShare(s, () => st().grocery.items, snap, share, usual);
  return { snap, n };
};
const usualOf = (n: string) => st().grocery.items.find(i => i.n === n)!.share ?? null;
const lineOf = (n: string) => st().groceryMonths[mk()]?.lines[idOf(n)];

describe('Apply and Undo on the real store', () => {
  it('sets this month for every picked item and leaves the usual splits alone', () => {
    const { n } = run([idOf('Eggs'), idOf('Beef')], { with: [] }, false);
    expect(n).toBe(2);
    expect(lineOf('Eggs')!.share).toEqual({ with: [] });
    expect(lineOf('Beef')!.share).toEqual({ with: [] });
    expect(usualOf('Eggs')).toBeNull();
    expect(lineOf('Rice')).toBeUndefined();
  });
  it('with the usual box the items own split moves on too', () => {
    run([idOf('Eggs')], { with: [SAM] }, true);
    expect(usualOf('Eggs')).toEqual({ with: [SAM] });
    expect(usualOf('Beef')).toBeNull();
  });
  it('drops the pack shares of a pack-priced line so every pack takes the split', () => {
    const e = idOf('Eggs');
    st().setGroceryPrices(mk(), e, [300, 400]);
    st().setGroceryPackShare(mk(), e, 0, { with: [SAM] });
    expect(lineOf('Eggs')!.packShares).toBeDefined();
    run([e], { with: [] }, false);
    expect(lineOf('Eggs')!.packShares).toBeUndefined();
    expect(lineOf('Eggs')!.share).toEqual({ with: [] });
  });
  it('Undo restores the lines, the pack shares and the usual splits exactly', () => {
    const e = idOf('Eggs');
    st().setGroceryPrices(mk(), e, [300, 400]);
    st().setGroceryPackShare(mk(), e, 0, { with: [SAM] });
    st().setGroceryItemShare(idOf('Beef'), { with: [SAM] });
    const before = JSON.stringify({ lines: st().groceryMonths[mk()]?.lines, items: st().grocery.items });
    const { snap } = run([e, idOf('Beef'), idOf('Rice')], { with: [SAM], notMine: true }, true);
    expect(JSON.stringify({ lines: st().groceryMonths[mk()]?.lines, items: st().grocery.items })).not.toBe(before);
    bulk.restoreShareSnapshot(snap, st(), (m, id) => st().groceryMonths[m]?.lines[id]);
    expect(JSON.stringify({ lines: st().groceryMonths[mk()]?.lines, items: st().grocery.items })).toBe(before);
  });
});
