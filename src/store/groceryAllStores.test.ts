import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStorage, saved } from '../test/browserStubs.js';

// The All stores default of a sharing group: at most one group has it, and turning it on or off leaves earlier months as they were counted.
let useAppStore: typeof import('./useAppStore.js').useAppStore; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
});
const ids = () => st().grocery.groups!.map(x => x.id);

describe('setGroceryAllStores', () => {
  it('marks one group, moves the mark to another, and clears it', () => {
    st().addGroceryGroup('Family', ['Sister']); st().addGroceryGroup('Pals', ['Bo']);
    const [fam, pals] = ids() as [string, string];
    expect(st().setGroceryAllStores(fam, true)).toBeUndefined();
    expect(st().grocery.groups!.map(x => !!x.allStores)).toEqual([true, false]);
    st().setGroceryAllStores(pals, true);
    expect(st().grocery.groups!.map(x => !!x.allStores)).toEqual([false, true]);
    expect(saved('grocery/main').groups[1].allStores).toBe(true);
    st().setGroceryAllStores(pals, false);
    expect(st().grocery.groups!.some(x => x.allStores)).toBe(false);
  });
  it('turning it off on one group leaves the mark on another', () => {
    st().addGroceryGroup('Family', ['Sister']); st().addGroceryGroup('Pals', ['Bo']);
    const [fam, pals] = ids() as [string, string];
    st().setGroceryAllStores(fam, true);
    st().setGroceryAllStores(pals, false);
    expect(st().grocery.groups!.map(x => !!x.allStores)).toEqual([true, false]);
  });
  it('removing the group that has it, while a past month names its people, leaves no mark on the gone group', async () => {
    st().addGroceryGroup('Family', ['Sister']);
    const sis = st().grocery.groups![0]!.people[0]!.id;
    useAppStore.setState({ groceryMonths: { '2026-01': { lines: { x: { got: true, share: { with: [sis] } } }, pulled: [] } } });
    st().setGroceryAllStores(ids()[0]!, true);
    st().removeGroceryGroup(ids()[0]!);
    expect(st().grocery.groups![0]).toMatchObject({ gone: true });
    expect(st().grocery.groups![0]!.allStores).toBeUndefined();
  });
  it('does nothing for a group that is not there', () => {
    st().addGroceryGroup('Family', []);
    st().setGroceryAllStores('nope', true);
    expect(st().grocery.groups!.some(x => x.allStores)).toBe(false);
  });
  it('an earlier month keeps the split it was bought with when the default is turned on', async () => {
    const { monthKey } = await import('../lib/grocery.js');
    const { purchasesOf } = await import('../lib/grocerySettle.js');
    st().addGroceryGroup('Family', ['Sister']);
    st().addGroceryStore('Aldi');
    st().addGroceryItem({ n: 'Rice', store: 'Aldi', qty: '1', price: '9.00', every: true });
    const past = '2026-01';
    expect(past < monthKey(new Date())).toBe(true);
    useAppStore.setState({ groceryMonths: { [past]: { lines: { [st().grocery.items[0]!.id]: { got: true } }, pulled: [] } } });
    st().setGroceryAllStores(ids()[0]!, true);
    expect(purchasesOf(st().grocery, st().groceryMonths[past]!)[0]!.parties).toEqual(['me']);
  });
});
