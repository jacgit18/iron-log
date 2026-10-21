import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

// Settled marks on the split card: an owed amount can be marked paid (money moved outside the app). Amounts never change, only what counts as outstanding.
let useAppStore; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { setAdmin } = await import('../features.js'); setAdmin(true);
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
});

// Aldi splits with Sam and Riley; a $10.00 item bought this month. You paid: Sam and Riley each owe $3.33, your share is $3.34.
const setup = async () => {
  const lib = await import('../lib/grocery.js'); const settle = await import('../lib/grocerySettle.js');
  st().addGroceryItem({ n: 'Milk', store: 'Aldi', qty: '1', price: '10.00', every: true });
  st().addGroceryGroup('Home', ['Sam', 'Riley']);
  const people = st().grocery.groups[0].people; const sam = people[0].id; const riley = people[1].id;
  st().setGroceryStoreGroup('Aldi', st().grocery.groups[0].id);
  const id = st().grocery.items[0].id; const mk = lib.monthKey(new Date());
  st().setGroceryGot(mk, id, true);
  const m = () => st().groceryMonths[mk];
  const status = () => settle.storeStatus(st().grocery, m(), 'Aldi');
  const row = who => status().rows.find(r => r.id === who);
  return { lib, settle, mk, sam, riley, m, status, row, owes: () => settle.monthOwes(st().grocery, m()) };
};

describe('marking an owed amount settled', () => {
  it('takes it out of what is still owed, changes no amount, and Undo (unmarking) puts it back and leaves no trace', async () => {
    const { mk, sam, riley, settle, m, status, row, owes } = await setup();
    expect(owes()).toEqual({ owed: 666, youOwe: 0 });
    const before = { ...settle.monthShare(st().grocery, m()), bill: status().rows.length };
    st().setGroceryPaid(mk, 'Aldi', riley, true);
    expect(row(riley)).toMatchObject({ kind: 'owesYou', cents: 333, paid: true, auto: false });
    expect(row(sam)).toMatchObject({ paid: false });
    expect(owes()).toEqual({ owed: 333, youOwe: 0 });
    expect(status()).toMatchObject({ owed: 333, outstanding: 333 });
    expect({ ...settle.monthShare(st().grocery, m()), bill: status().rows.length }).toEqual(before); // paid and your share are untouched
    st().setGroceryPaid(mk, 'Aldi', riley, false);
    expect(owes()).toEqual({ owed: 666, youOwe: 0 });
    expect(m().paid).toBeUndefined();
  });
  it('a person marked Share already paid starts as paid, and Not paid overrides that for this store and month only', async () => {
    const { mk, sam, m, row, owes } = await setup();
    const gid = st().grocery.groups[0].id;
    st().updateGroceryPerson(gid, sam, { covered: true });
    expect(row(sam)).toMatchObject({ kind: 'covered', paid: true, auto: true });
    expect(owes().owed).toBe(333);
    st().setGroceryPaid(mk, 'Aldi', sam, false);
    expect(row(sam)).toMatchObject({ paid: false, auto: false });
    expect(owes().owed).toBe(666); // counted as owed again
    st().setGroceryPaid(mk, 'Aldi', sam, true); // back to the default: the mark is dropped
    expect(m().paid).toBeUndefined();
  });
  it('works when someone else paid: "you owe" can be marked sent, a between-others row can be marked, and a covered person defaults to paid there', async () => {
    const { mk, sam, riley, row, owes } = await setup();
    const gid = st().grocery.groups[0].id;
    st().setGroceryPayer(mk, 'Aldi', sam); // Sam paid the bill
    expect(row(sam)).toMatchObject({ kind: 'youOwe', cents: 334, paid: false });
    expect(row(riley)).toMatchObject({ kind: 'owesPayer', cents: 333, paid: false });
    expect(owes()).toEqual({ owed: 0, youOwe: 334 });
    st().setGroceryPaid(mk, 'Aldi', sam, true);
    expect(owes()).toEqual({ owed: 0, youOwe: 0 });
    st().setGroceryPaid(mk, 'Aldi', riley, true);
    expect(row(riley).paid).toBe(true);
    expect(owes()).toEqual({ owed: 0, youOwe: 0 }); // a row between others never counts toward what you owe or are owed
    st().setGroceryPaid(mk, 'Aldi', riley, false);
    st().updateGroceryPerson(gid, riley, { covered: true });
    expect(row(riley)).toMatchObject({ paid: true, auto: true }); // covered: already paid, whoever paid the bill
  });
  it('changing who paid starts the store’s marks over, and leaves other stores alone', async () => {
    const { mk, sam, riley, m, row } = await setup();
    st().addGroceryItem({ n: 'Rice', store: 'Lidl', qty: '1', price: '5.00', every: true });
    const rice = st().grocery.items.find(i => i.n === 'Rice').id; st().setGroceryGot(mk, rice, true);
    st().setGroceryStoreGroup('Lidl', st().grocery.groups[0].id);
    st().setGroceryPaid(mk, 'Aldi', riley, true); st().setGroceryPaid(mk, 'Lidl', riley, true);
    expect(Object.keys(m().paid)).toHaveLength(2);
    st().setGroceryPayer(mk, 'Aldi', sam);
    expect(Object.keys(m().paid)).toHaveLength(1);
    expect(Object.keys(m().paid)[0].startsWith('Lidl\n')).toBe(true);
    st().setGroceryPayer(mk, 'Aldi', null);
    expect(row(riley).paid).toBe(false); // a different payment: unmarked
  });
  it('ignores a person or month that has no such row', async () => {
    const { mk, m } = await setup();
    st().setGroceryPaid(mk, 'Aldi', 'nobody', true);
    st().setGroceryPaid('2001-01', 'Aldi', 'x', true);
    st().setGroceryPaid(mk, 'Elsewhere', 'x', true);
    expect(m().paid).toBeUndefined();
  });
});

describe('settled marks in saved data and sync', () => {
  it('are kept only as "store, payer, person" keys with a yes or a no', async () => {
    const { normGroceryMonth, paidKey } = await import('../shared/grocery.js');
    const good = paidKey('Aldi', 'me', 'p1');
    const m = normGroceryMonth({ lines: {}, pulled: [], paid: { [good]: true, 'Aldi\nme\np2': false, 'Aldi\nme': true, 'a\nb\nc\nd': true, 'Aldi\nme\nme': true, 'Aldi\nme\np3': 'yes', __proto__x: true } });
    expect(m.paid).toEqual({ [good]: true, 'Aldi\nme\np2': false });
  });
  it('merge key by key: two phones marking different rows keep both, and the same row goes to this phone', async () => {
    const { mergeGroceryMonth3 } = await import('../sync/merge.js'); const { paidKey } = await import('../shared/grocery.js');
    const a = paidKey('Aldi', 'me', 'a'), b = paidKey('Aldi', 'me', 'b');
    const base = { lines: {}, pulled: [] };
    const ours = { ...base, paid: { [a]: true } }; const theirs = { ...base, paid: { [b]: true, [a]: false } };
    expect(mergeGroceryMonth3(base, ours, theirs).week.paid).toEqual({ [a]: true, [b]: true });
  });
  it('an old month with no marks reads the defaults, and a month holding only marks is not empty', async () => {
    const { monthEmpty, paidKey } = await import('../shared/grocery.js');
    expect(monthEmpty({ lines: {}, pulled: [] })).toBe(true);
    expect(monthEmpty({ lines: {}, pulled: [], paid: { [paidKey('Aldi', 'me', 'p')]: true } })).toBe(false);
  });
});

describe('review fixes', () => {
  it('a "you owe" mark (the payer is the person) survives the cleaning, the merge and a reload, not only memory', async () => {
    const { mk, sam, m, owes } = await setup();
    const { normGroceryMonth } = await import('../shared/grocery.js'); const { mergeGroceryMonth3 } = await import('../sync/merge.js');
    st().setGroceryPayer(mk, 'Aldi', sam);
    st().setGroceryPaid(mk, 'Aldi', sam, true); // You sent Sam
    expect(owes().youOwe).toBe(0);
    const key = Object.keys(m().paid)[0];
    expect(key).toBe(`Aldi\n${sam}\n${sam}`);
    expect(normGroceryMonth(JSON.parse(JSON.stringify(m()))).paid).toEqual({ [key]: true });
    expect(mergeGroceryMonth3(null, m(), { lines: {}, pulled: [] }).week.paid).toEqual({ [key]: true });
  });
  it('adding from a file into a month that already exists keeps the marks here, and takes marks the file brings', async () => {
    const lib = await import('../lib/grocery.js'); const { paidKey } = await import('../shared/grocery.js');
    const g = { stores: ['Aldi'], items: [{ id: 'milk', n: 'Milk', store: 'Aldi', qty: 1, cents: 100, every: true, out: false }, { id: 'rice', n: 'Rice', store: 'Aldi', qty: 1, cents: 100, every: true, out: false }] };
    const a = paidKey('Aldi', 'me', 'p1'), b = paidKey('Aldi', 'me', 'p2');
    const months = { '2026-09': { lines: { milk: { got: true } }, pulled: [], paid: { [a]: true } } };
    const out = lib.mergeGrocery(g, months, { ...g, months: { '2026-09': { lines: { rice: { got: true } }, pulled: [], paid: { [b]: true } } } });
    expect(out.months['2026-09'].paid).toEqual({ [a]: true, [b]: true });
    expect(Object.keys(out.months['2026-09'].lines).sort()).toEqual(['milk', 'rice']);
    const onlyMarks = lib.mergeGrocery(g, months, { ...g, months: { '2026-09': { lines: { milk: { got: true } }, pulled: [], paid: { [b]: true } } } });
    expect(onlyMarks.changed).toBe(true);
    expect(onlyMarks.months['2026-09'].paid).toEqual({ [a]: true, [b]: true });
  });
  it('the store line says Settled once nothing is outstanding, and counts only what is still owed', async () => {
    const { mk, riley, sam } = await setup();
    st().setGroceryPaid(mk, 'Aldi', riley, true);
    const { storeStatus } = await import('../lib/grocerySettle.js');
    expect(storeStatus(st().grocery, st().groceryMonths[mk], 'Aldi')).toMatchObject({ owed: 333, outstanding: 333 });
    st().setGroceryPaid(mk, 'Aldi', sam, true);
    expect(storeStatus(st().grocery, st().groceryMonths[mk], 'Aldi')).toMatchObject({ owed: 0, outstanding: 0 });
  });
});
