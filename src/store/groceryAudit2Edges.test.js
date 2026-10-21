import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

// Second closing audit, store edges: N-16 (covered frozen per month), N-17a (store names case-insensitive in the cleaner and the merge),
// N-17b (settled marks keep a store alive), G-6 (reserved names refused as store names).
let useAppStore; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { setAdmin } = await import('../features.js'); setAdmin(true);
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
});

describe('N-16: covered is frozen per month', () => {
  const setup = async () => {
    const lib = await import('../lib/grocery.js'); const settle = await import('../lib/grocerySettle.js');
    st().addGroceryItem({ n: 'Milk', store: 'Aldi', qty: '1', price: '10.00', every: true });
    st().addGroceryGroup('Home', ['Sam']);
    const gid = st().grocery.groups[0].id; const sam = st().grocery.groups[0].people[0].id;
    st().setGroceryStoreGroup('Aldi', gid);
    const id = st().grocery.items[0].id; const mk = lib.monthKey(new Date()); const last = lib.shiftMonth(mk, -1);
    st().setGroceryGot(last, id, true); st().setGroceryGot(mk, id, true);
    const owed = key => settle.monthOwes(st().grocery, st().groceryMonths[key]).owed;
    return { gid, sam, mk, last, owed };
  };
  it('marking a person covered later does not settle a past month, but takes effect for this one', async () => {
    const { gid, sam, mk, last, owed } = await setup();
    expect(owed(last)).toBe(500); expect(owed(mk)).toBe(500);
    st().updateGroceryPerson(gid, sam, { covered: true });
    expect(owed(last)).toBe(500);
    expect(owed(mk)).toBe(0);
  });
  it('un-marking covered later does not reopen a past month that was settled by it', async () => {
    const { gid, sam, mk, last, owed } = await setup();
    st().updateGroceryPerson(gid, sam, { covered: true });
    expect(owed(last)).toBe(500); // pinned above
    st().updateGroceryPerson(gid, sam, { covered: false });
    // the past month was outstanding when covered was set, and stays so
    expect(owed(last)).toBe(500);
    expect(owed(mk)).toBe(500);
  });
  it('a month that was covered when it was bought stays settled after covered is switched off', async () => {
    const { gid, sam, mk, last, owed } = await setup();
    st().updateGroceryPerson(gid, sam, { covered: true });
    st().setGroceryGot(last, st().grocery.items[0].id, true); // no-op re-read
    // Simulate a month bought while covered: fresh item, covered already on
    const lib = await import('../lib/grocery.js');
    const older = lib.shiftMonth(mk, -2);
    st().setGroceryGot(older, st().grocery.items[0].id, true);
    expect(owed(older)).toBe(0);
    st().updateGroceryPerson(gid, sam, { covered: false });
    expect(owed(older)).toBe(0);
  });
});

describe('N-17a: store names are one name whatever the case', () => {
  it('normGrocery keeps the live spelling and drops a retired twin', async () => {
    const { normGrocery } = await import('../lib/grocery.js');
    const g = normGrocery({ stores: ['Aldi', 'aldi', 'Costco'], retired: ['ALDI', 'Lidl', 'lidl'], items: [{ id: 'm', n: 'Milk', store: 'aldi' }] });
    expect(g.stores).toEqual(['Aldi', 'Costco']);
    expect(g.retired).toEqual(['Lidl']);
    expect(g.items[0].store).toBe('Aldi');
  });
  it('mergeGrocery does not add a store or a retired name that differs only by case', async () => {
    const { normGrocery, mergeGrocery, normGroceryData } = await import('../lib/grocery.js');
    const cur = normGrocery({ stores: ['Aldi'], retired: ['Lidl'] });
    const inc = normGroceryData({ stores: ['aldi', 'LIDL', 'Costco'], retired: ['ALDI'], items: [{ id: 'x', n: 'Eggs', store: 'aldi' }], months: {} });
    const { grocery } = mergeGrocery(cur, {}, inc);
    expect(grocery.stores).toEqual(['Aldi', 'Lidl', 'Costco']); // the file's live LIDL brings the retired Lidl back, under its old spelling
    expect(grocery.retired).toBeUndefined();
    expect(grocery.items[0].store).toBe('Aldi');
  });
});

describe('N-17b: a settled mark keeps a store alive', () => {
  it('retires a store that only a settled mark names', async () => {
    const lib = await import('../lib/grocery.js');
    st().addGroceryItem({ n: 'Milk', store: 'Aldi', qty: '1', price: '1.00', every: true });
    const mk = lib.monthKey(new Date()); const last = lib.shiftMonth(mk, -1);
    useAppStore.setState({ groceryMonths: { [last]: { lines: {}, pulled: [], paid: { 'Aldi\nme\nsam': 100 } } } });
    st().removeGroceryItem(st().grocery.items[0].id);
    expect(st().removeGroceryStore('Aldi')).toBeNull();
    expect(st().grocery.retired).toEqual(['Aldi']);
  });
});

describe('G-6: reserved names are not store names', () => {
  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])('addGroceryStore refuses %s', async name => {
    const err = st().addGroceryStore(name);
    expect(typeof err).toBe('string');
    expect(st().grocery.stores).toEqual([]);
  });
  it('addGroceryItem and updateGroceryItem refuse a reserved Store', async () => {
    expect(typeof st().addGroceryItem({ n: 'Milk', store: '__proto__', qty: '1', price: '', every: true })).toBe('string');
    expect(st().grocery.items).toEqual([]);
    st().addGroceryItem({ n: 'Milk', store: 'Aldi', qty: '1', price: '', every: true });
    const id = st().grocery.items[0].id;
    expect(typeof st().updateGroceryItem(id, { store: 'constructor' })).toBe('string');
    expect(st().grocery.items[0].store).toBe('Aldi');
    expect(st().grocery.stores).toEqual(['Aldi']);
  });
  it('the cleaner drops reserved names from stores and retired', async () => {
    const { normGrocery } = await import('../lib/grocery.js');
    const g = normGrocery({ stores: ['__proto__', 'constructor', 'Aldi'], retired: ['toString', 'Lidl'], items: [] });
    expect(g.stores).toEqual(['Aldi']);
    expect(g.retired).toEqual(['Lidl']);
  });
});
