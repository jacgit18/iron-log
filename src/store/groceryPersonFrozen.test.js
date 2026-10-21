import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

// Code audit M-05 (and G-2): removing a person, adding one, or changing a store's group must not rewrite a month already bought.
let useAppStore; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { setAdmin } = await import('../features.js'); setAdmin(true);
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
});

// Aldi shared with Sis; Milk $10 bought LAST month (you paid) and a second item bought this month.
const setup = async () => {
  const lib = await import('../lib/grocery.js'); const settle = await import('../lib/grocerySettle.js');
  st().addGroceryItem({ n: 'Milk', store: 'Aldi', qty: '1', price: '10.00', every: true });
  st().addGroceryItem({ n: 'Eggs', store: 'Aldi', qty: '1', price: '4.00', every: true });
  st().addGroceryGroup('Home', ['Sis']);
  const group = () => st().grocery.groups[0]; const gid = group().id; const sis = group().people[0].id;
  st().setGroceryStoreGroup('Aldi', gid);
  const milk = st().grocery.items.find(i => i.n === 'Milk').id; const eggs = st().grocery.items.find(i => i.n === 'Eggs').id;
  const mk = lib.monthKey(new Date()); const last = lib.shiftMonth(mk, -1);
  st().setGroceryGot(last, milk, true); st().setGroceryGot(mk, eggs, true);
  const owed = key => settle.monthOwes(st().grocery, st().groceryMonths[key]).owed;
  return { lib, settle, group, gid, sis, milk, eggs, mk, last, owed };
};

describe('removing a person', () => {
  it('leaves last month as it was (what Sis owed stays), and marks her gone because last month names her', async () => {
    const { group, gid, sis, owed, last } = await setup();
    expect(owed(last)).toBe(500);
    st().removeGroceryPerson(gid, sis);
    expect(owed(last)).toBe(500);
    expect(group().people).toEqual([{ id: sis, n: 'Sis', gone: true }]);
  });
  it('leaves her out of this month and of anything new', async () => {
    const { settle, gid, sis, owed, mk } = await setup();
    expect(owed(mk)).toBe(200);
    st().removeGroceryPerson(gid, sis);
    expect(owed(mk)).toBe(0); // this month follows the change: Eggs is now yours alone
    expect(settle.allPeople(st().grocery)).toEqual([]); // not offered in any picker
    expect(settle.everyone(st().grocery).map(p => p.n)).toEqual(['Sis']); // still named for past months
    st().addGroceryItem({ n: 'Bread', store: 'Aldi', qty: '1', price: '3.00', every: true });
    const bread = st().grocery.items.find(i => i.n === 'Bread').id;
    expect(settle.partiesFor(st().grocery, st().grocery.items.find(i => i.id === bread))).toEqual(['me']);
  });
  it('keeps a payer who was removed: last month still says who you owe', async () => {
    const { settle, gid, sis, last } = await setup();
    st().setGroceryPayer(last, 'Aldi', sis);
    expect(settle.monthOwes(st().grocery, st().groceryMonths[last])).toMatchObject({ youOwe: 500 });
    st().removeGroceryPerson(gid, sis);
    expect(settle.payerOf(st().grocery, st().groceryMonths[last], 'Aldi')).toBe(sis);
    expect(settle.monthOwes(st().grocery, st().groceryMonths[last])).toMatchObject({ youOwe: 500 });
  });
  it('deletes a person no month names outright, and a gone person’s name can be used again', async () => {
    const { group, gid, sis, last, milk } = await setup();
    st().addGroceryPerson(gid, 'Bob'); const bob = group().people[1].id;
    st().removeGroceryPerson(gid, bob);
    expect(group().people.map(p => p.id)).toEqual([sis]); // Bob was added after last month and named nowhere
    st().removeGroceryPerson(gid, sis);
    expect(group().people).toHaveLength(1); // Sis is gone but kept
    expect(st().addGroceryPerson(gid, 'Sis')).toBeNull(); // the name is free again
    expect(group().people.filter(p => !p.gone).map(p => p.n)).toEqual(['Sis']);
    expect(st().groceryMonths[last].lines[milk].share).toEqual({ with: [sis] });
  });
});

describe('the other ways a month’s split could change', () => {
  it('adding a person to the group does not change what was owed last month', async () => {
    const { gid, owed, last, mk } = await setup();
    st().addGroceryPerson(gid, 'Bob');
    expect(owed(last)).toBe(500); // not 666
    expect(owed(mk)).toBe(266); // this month follows: Eggs is now split three ways
  });
  it('taking the store out of the group, or removing the group, does not change last month either', async () => {
    const { gid, owed, last } = await setup();
    st().setGroceryStoreGroup('Aldi', null);
    expect(owed(last)).toBe(500);
    st().setGroceryStoreGroup('Aldi', gid);
    st().removeGroceryGroup(gid);
    expect(owed(last)).toBe(500);
  });
  it('does nothing to data when no group exists', async () => {
    const lib = await import('../lib/grocery.js');
    st().addGroceryItem({ n: 'Rice', store: 'Aldi', qty: '1', price: '5.00', every: true });
    const id = st().grocery.items[0].id; const last = lib.shiftMonth(lib.monthKey(new Date()), -1);
    st().setGroceryGot(last, id, true);
    st().addGroceryGroup('Home', ['Sis']);
    expect(st().groceryMonths[last].lines[id].share).toBeUndefined(); // pinned only when a person or a group changes after this
  });
});

describe('gone people in saved data', () => {
  it('a group keeps the gone mark through the cleaning that runs on load and sync', async () => {
    const { normGroceryGroup, validGroceryGroup } = await import('../shared/grocery.js');
    const g = { id: 'g1', n: 'Home', stores: [], people: [{ id: 'p1', n: 'Sis', gone: true }, { id: 'p2', n: 'Bob', gone: 'yes' }] };
    expect(normGroceryGroup(g).people).toEqual([{ id: 'p1', n: 'Sis', gone: true }, { id: 'p2', n: 'Bob' }]);
    expect(validGroceryGroup({ ...g, people: [g.people[0]] })).toBe(true);
    expect(validGroceryGroup(g)).toBe(false);
  });
});

describe('edges found by the independent review', () => {
  it('a person marked Share already paid stays that way for last month after they are removed', async () => {
    const { settle, group, gid, sis, owed, last } = await setup();
    st().updateGroceryPerson(gid, sis, { covered: true });
    expect(owed(last)).toBe(500); // covering her now does not settle a month already lived (N-16); this one is marked paid by hand
    st().setGroceryPaid(last, 'Aldi', sis, true);
    expect(owed(last)).toBe(0);
    st().removeGroceryPerson(gid, sis);
    expect(group().people[0]).toEqual({ id: sis, n: 'Sis', covered: true, gone: true });
    expect(owed(last)).toBe(0);
    expect(settle.storeSettlement(st().grocery, st().groceryMonths[last], 'Aldi').rows[0]).toMatchObject({ id: sis, kind: 'covered' });
  });
  it('changing an item’s usual split after a removal pins last month with who it was counted with, not with people who are gone', async () => {
    const { settle, group, gid, sis, last } = await setup();
    st().addGroceryPerson(gid, 'Bob'); const bob = group().people[1].id;
    st().removeGroceryPerson(gid, sis); // last month's Milk was pinned with Sis at this point
    st().addGroceryItem({ n: 'Jam', store: 'Aldi', qty: '1', price: '6.00', every: true });
    const jam = st().grocery.items.find(i => i.n === 'Jam').id;
    st().setGroceryGot(last, jam, true); // bought in a past month after Sis was removed: counted with Bob only
    expect(settle.purchasesOf(st().grocery, st().groceryMonths[last]).find(p => p.itemId === jam).parties).toEqual(['me', bob]);
    st().setGroceryItemShare(jam, { with: [bob] });
    expect(st().groceryMonths[last].lines[jam].share).toEqual({ with: [bob] }); // not { with: [sis, bob] }
  });
  it('counts only the people who are still in a group, in the tag and in what makes a store shared', async () => {
    const lib = await import('../lib/grocery.js');
    const { group, gid, sis } = await setup();
    st().addGroceryPerson(gid, 'Bob');
    st().removeGroceryPerson(gid, sis);
    expect(lib.groupTag(group())).toBe('Home +1');
    st().removeGroceryPerson(gid, group().people.find(p => p.n === 'Bob').id);
    expect(lib.groupTag(group())).toBe('Home +0');
    expect(lib.byStore(st().grocery, st().grocery.items, true).every(x => !x.group)).toBe(true); // nobody left to split with: not a shared store
  });
  it('lets gone groups and gone people sit beside a full set of live ones when the data is cleaned or added from a file', async () => {
    const lib = await import('../lib/grocery.js'); const shared = await import('../shared/grocery.js');
    const live = Array.from({ length: 10 }, (_, i) => ({ id: `g${i}`, n: `G${i}`, people: [], stores: [] }));
    const gone = Array.from({ length: 3 }, (_, i) => ({ id: `x${i}`, n: `X${i}`, people: [{ id: 'p', n: 'P', gone: true }], stores: [], gone: true }));
    const clean = lib.normGrocery({ stores: [], items: [], groups: [...gone, ...live] });
    expect(clean.groups.filter(x => !x.gone)).toHaveLength(10);
    expect(clean.groups.filter(x => x.gone)).toHaveLength(3);
    const people = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, n: `Q${i}`, ...(i < 3 ? { gone: true } : {}) }));
    expect(shared.normGroceryGroup({ id: 'g', n: 'Big', stores: [], people }).people).toHaveLength(12);
  });
});

describe('after the only group is removed (overnight closing audit Y-2)', () => {
  it('still counts as sharing, so the money for past months stays visible, and offers nobody to pick', async () => {
    const settle = await import('../lib/grocerySettle.js');
    const { gid, owed, last } = await setup();
    expect(settle.hasSharing(st().grocery)).toBe(true);
    st().removeGroceryGroup(gid);
    expect(st().grocery.groups[0].gone).toBe(true);
    expect(settle.hasSharing(st().grocery)).toBe(true); // To get keeps its money line, the split section and the Spending share line
    expect(owed(last)).toBe(500);
    expect(settle.allPeople(st().grocery)).toEqual([]); // nobody to pick: the share pickers hide themselves
  });
});
