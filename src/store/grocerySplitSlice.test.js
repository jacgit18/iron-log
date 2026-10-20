import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage, saved } from '../test/browserStubs.js';

// Sharing what you buy with other people: groups, shares and who paid. Prices and totals are not touched here (grocerySlice.test.js).
let useAppStore; const st = () => useAppStore.getState();
const form = (o = {}) => ({ n: 'Chicken', store: "BJ's", qty: '1', price: '9.00', every: true, ...o });
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { setAdmin } = await import('../features.js'); setAdmin(true);
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
});
const month = async () => (await import('../lib/grocery.js')).monthKey(new Date());
const group = () => st().grocery.groups[0];

describe('groups and people', () => {
  it('makes a group with its people, with ids of their own, and saves it', () => {
    expect(st().addGroceryGroup('  Costco   run ', ['Sister', ' Mom '])).toBeNull();
    expect(group()).toMatchObject({ n: 'Costco run', stores: [] });
    expect(group().people.map(p => p.n)).toEqual(['Sister', 'Mom']);
    expect(new Set([group().id, ...group().people.map(p => p.id)]).size).toBe(3);
    expect(saved('grocery/main').groups[0].n).toBe('Costco run');
  });
  it('refuses a blank name, a repeat, and too many people, and changes nothing', () => {
    expect(st().addGroceryGroup('  ', [])).toMatch(/name/);
    expect(st().addGroceryGroup('Home', Array.from({ length: 11 }, (_, i) => `P${i}`))).toMatch(/up to 10/);
    expect(st().grocery.groups).toBeUndefined();
    expect(st().addGroceryGroup('Home', [])).toBeNull();
    expect(st().addGroceryGroup('home', [])).toMatch(/already/);
    expect(st().grocery.groups).toHaveLength(1);
  });
  it('adds, renames, marks covered and removes a person, and refuses a repeat or a blank', () => {
    st().addGroceryGroup('Home', ['Sister']);
    const gid = group().id;
    expect(st().addGroceryPerson(gid, 'Mom')).toBeNull();
    expect(st().addGroceryPerson(gid, 'mom')).toMatch(/already/);
    expect(st().addGroceryPerson(gid, ' ')).toMatch(/name/);
    const mom = group().people[1].id;
    expect(st().updateGroceryPerson(gid, mom, { covered: true })).toBeNull();
    expect(group().people[1]).toEqual({ id: mom, n: 'Mom', covered: true });
    expect(st().updateGroceryPerson(gid, mom, { covered: false })).toBeNull();
    expect('covered' in group().people[1]).toBe(false); // cleared: the key is gone
    expect(st().updateGroceryPerson(gid, mom, { n: 'Mother' })).toBeNull();
    expect(st().updateGroceryPerson(gid, 'nope', { n: 'X' })).toMatch(/gone/);
    st().removeGroceryPerson(gid, mom);
    expect(group().people.map(p => p.n)).toEqual(['Sister']);
  });
  it('renames a group and removes it; with none left the key is gone from the list', () => {
    st().addGroceryGroup('Home', []);
    expect(st().renameGroceryGroup(group().id, 'Family')).toBeNull();
    expect(group().n).toBe('Family');
    st().removeGroceryGroup(group().id);
    expect('groups' in st().grocery).toBe(false);
  });
});

describe('a store defaults to one group', () => {
  it('moves the store between groups, never in two at once, and clears it', () => {
    st().addGroceryItem(form());
    st().addGroceryGroup('A', []); st().addGroceryGroup('B', []);
    const [a, b] = st().grocery.groups.map(x => x.id);
    st().setGroceryStoreGroup("BJ's", a);
    expect(st().grocery.groups.map(x => x.stores)).toEqual([["BJ's"], []]);
    st().setGroceryStoreGroup("BJ's", b);
    expect(st().grocery.groups.map(x => x.stores)).toEqual([[], ["BJ's"]]);
    st().setGroceryStoreGroup("BJ's", null);
    expect(st().grocery.groups.map(x => x.stores)).toEqual([[], []]);
  });
  it('ignores a store that is not in the list', () => {
    st().addGroceryGroup('A', []);
    st().setGroceryStoreGroup('Nowhere', st().grocery.groups[0].id);
    expect(group().stores).toEqual([]);
  });
  it('Undo puts a removed store back in its group, unless that group is gone', () => {
    st().addGroceryStore('A'); st().addGroceryStore("BJ's"); st().addGroceryGroup('Home', []); st().addGroceryGroup('Other', []);
    const [home, other] = st().grocery.groups.map(x => x.id);
    st().setGroceryStoreGroup("BJ's", home);
    st().removeGroceryStore("BJ's");
    expect(st().grocery.groups[0].stores).toEqual([]);
    st().undoRemoved();
    expect(st().grocery.stores).toEqual(['A', "BJ's"]);
    expect(st().grocery.groups[0].stores).toEqual(["BJ's"]); // its default group came back with it
    st().removeGroceryStore("BJ's");
    st().removeGroceryGroup(home); // the group went meanwhile
    st().undoRemoved();
    expect(st().grocery.stores).toEqual(['A', "BJ's"]);
    expect(st().grocery.groups.map(x => x.stores)).toEqual([[]]);
    expect(st().grocery.groups.map(x => x.id)).toEqual([other]);
  });
  it('removing a store takes it out of its group', () => {
    st().addGroceryGroup('A', []); st().addGroceryStore("BJ's");
    st().setGroceryStoreGroup("BJ's", group().id);
    expect(st().removeGroceryStore("BJ's")).toBeNull();
    expect(group().stores).toEqual([]);
  });
});

describe('shares', () => {
  it('sets and clears an item\'s usual share, and ignores one that is not a share', () => {
    st().addGroceryItem(form());
    st().setGroceryItemShare('chicken', { with: ['a', 'a', 'b'] });
    expect(st().grocery.items[0].share).toEqual({ with: ['a', 'b'] });
    expect(saved('grocery/main').items[0].share).toEqual({ with: ['a', 'b'] });
    st().setGroceryItemShare('chicken', { with: 'x' });
    expect(st().grocery.items[0].share).toEqual({ with: ['a', 'b'] });
    st().setGroceryItemShare('chicken', null);
    expect('share' in st().grocery.items[0]).toBe(false);
  });
  it('sets and clears this month\'s share for an item, and an emptied line goes away', async () => {
    st().addGroceryItem(form()); const mk = await month();
    st().setGroceryLineShare(mk, 'chicken', { with: ['sis'], notMine: true });
    expect(st().groceryMonths[mk].lines.chicken.share).toEqual({ with: ['sis'], notMine: true });
    st().setGroceryLineShare(mk, 'chicken', null);
    expect(st().groceryMonths[mk]).toBeUndefined(); // nothing else on the month: it is the fresh list again
  });
  it('shares one pack of a line priced pack by pack, and only such a line', async () => {
    st().addGroceryItem(form()); const mk = await month();
    st().setGroceryPackShare(mk, 'chicken', 0, { with: ['sis'] });
    expect(st().groceryMonths[mk]).toBeUndefined(); // no packs yet: nothing to share
    st().setGroceryPrices(mk, 'chicken', [899, 1049, 925]);
    st().setGroceryPackShare(mk, 'chicken', 1, { with: ['sis', 'mom'] });
    expect(st().groceryMonths[mk].lines.chicken.packShares).toEqual([null, { with: ['sis', 'mom'] }, null]);
    st().setGroceryPackShare(mk, 'chicken', 7, { with: ['sis'] }); // out of range: ignored
    expect(st().groceryMonths[mk].lines.chicken.packShares).toHaveLength(3);
    st().setGroceryPackShare(mk, 'chicken', 1, null);
    expect('packShares' in st().groceryMonths[mk].lines.chicken).toBe(false);
  });
  it('keeps each pack\'s share while packs are added, and drops them when the line goes back to one price', async () => {
    st().addGroceryItem(form()); const mk = await month();
    st().setGroceryPrices(mk, 'chicken', [899, 1049]);
    st().setGroceryPackShare(mk, 'chicken', 1, { with: ['sis'] });
    st().setGroceryPrices(mk, 'chicken', [899, 1049, 925]);
    expect(st().groceryMonths[mk].lines.chicken.packShares).toEqual([null, { with: ['sis'] }, null]);
    st().setGroceryPrices(mk, 'chicken', [899]);
    expect('packShares' in st().groceryMonths[mk].lines.chicken).toBe(false); // the only pack left has no share
    st().setGroceryPrices(mk, 'chicken', [899, 1049]);
    st().setGroceryPackShare(mk, 'chicken', 1, { with: ['sis'] });
    st().setGroceryQty(mk, 'chicken', 2);
    expect(st().groceryMonths[mk].lines.chicken).toEqual({ qty: 2 });
  });
});

describe('who paid', () => {
  it('records who paid for a store this month, and clears it back to you', async () => {
    const mk = await month();
    st().setGroceryPayer(mk, "BJ's", 'mom');
    expect(st().groceryMonths[mk].payer).toEqual({ "BJ's": 'mom' });
    expect(saved('grocery/' + mk).payer).toEqual({ "BJ's": 'mom' });
    st().setGroceryPayer(mk, "BJ's", null);
    expect(st().groceryMonths[mk]).toBeUndefined();
  });
});

describe('a month\'s share carries on to the next months', () => {
  const emptyMonth = () => ({ pulled: [], lines: {} });
  const shiftKey = async (by) => (await import('../lib/grocery.js')).shiftMonth(await month(), by);
  it('makes the share set this month the item\'s usual, and a later change the next usual', async () => {
    st().addGroceryItem(form()); const mk = await month();
    st().setGroceryLineShare(mk, 'chicken', { with: ['sis'] });
    expect(st().grocery.items[0].share).toEqual({ with: ['sis'] });
    expect(saved('grocery/main').items[0].share).toEqual({ with: ['sis'] });
    st().setGroceryLineShare(mk, 'chicken', { with: ['sis', 'mom'] });
    expect(st().grocery.items[0].share).toEqual({ with: ['sis', 'mom'] });
    st().setGroceryLineShare(mk, 'chicken', null); // back to the store's group
    expect('share' in st().grocery.items[0]).toBe(false);
  });
  it('leaves earlier months as they were bought, but not an older month fixed by hand', async () => {
    st().addGroceryItem(form()); const mk = await month(); const last = await shiftKey(-1);
    st().setGroceryItemShare('chicken', { with: ['sis'] });
    useAppStore.setState({ groceryMonths: { [last]: { ...emptyMonth(), lines: { chicken: { got: true } } } } });
    st().setGroceryLineShare(mk, 'chicken', { with: ['mom'] });
    expect(st().groceryMonths[last].lines.chicken.share).toEqual({ with: ['sis'] }); // counted with the old usual, still
    expect(st().grocery.items[0].share).toEqual({ with: ['mom'] });
    st().setGroceryLineShare(last, 'chicken', { with: ['dad'] }); // fixing an older month does not move the usual
    expect(st().groceryMonths[last].lines.chicken.share).toEqual({ with: ['dad'] });
    expect(st().grocery.items[0].share).toEqual({ with: ['mom'] });
  });
  it('pins this month\'s bought line when the share is set from next month', async () => {
    st().addGroceryItem(form()); const mk = await month(); const next = await shiftKey(1);
    st().setGroceryItemShare('chicken', { with: ['sis'] });
    useAppStore.setState({ groceryMonths: { [mk]: { ...emptyMonth(), lines: { chicken: { got: true } } } } });
    st().setGroceryLineShare(next, 'chicken', { with: ['mom'] });
    expect(st().groceryMonths[mk].lines.chicken.share).toEqual({ with: ['sis'] }); // bought this month with the old usual
    expect(st().grocery.items[0].share).toEqual({ with: ['mom'] });
  });
  it('pins a month that used the store\'s group when the item\'s usual first appears', async () => {
    st().addGroceryItem(form()); st().addGroceryGroup('Home', ['Sister']); const sis = group().people[0].id; st().setGroceryStoreGroup("BJ's", group().id);
    const mk = await month(); const last = await shiftKey(-1);
    useAppStore.setState({ groceryMonths: { [last]: { ...emptyMonth(), lines: { chicken: { got: true } } } } });
    st().setGroceryLineShare(mk, 'chicken', { with: [] });
    expect(st().groceryMonths[last].lines.chicken.share).toEqual({ with: [sis] });
  });
});
