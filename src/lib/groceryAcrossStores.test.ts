import { describe, expect, it } from 'vitest';
import { acrossStores } from './groceryAcrossStores.js';
import { byStore, normGrocery, paidKey } from './grocery.js';
import { groupOfStore, monthOwes, partiesFor, purchasesOf } from './grocerySettle.js';
import { ME } from './grocerySplit.js';
import { normGroceryGroup, validGroceryGroup } from '../shared/grocery.js';
import type { Grocery, GroceryGroup, GroceryMonth } from '../types.ts';

const item = (id: string, store: string, cents: number, extra: object = {}) => ({ id, n: id, store, qty: 1, cents, every: true, out: false, ...extra });
const family: GroceryGroup = { id: 'fam', n: 'Family', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom' }], stores: [], allStores: true };
const g: Grocery = {
  stores: ["BJ's", 'Aldi', 'Lidl'],
  items: [item('tp', "BJ's", 3000), item('rice', 'Aldi', 900), item('tea', 'Lidl', 600, { share: { with: [] } }), item('soap', '', 300)],
  groups: [family],
};
// Sister paid at Aldi; you paid at BJ's.
const month: GroceryMonth = { lines: { tp: { got: true }, rice: { got: true } }, pulled: [], payer: { Aldi: 'sis' } };

describe('All stores group', () => {
  it('is the split for a store with no group of its own, the no-store group included', () => {
    expect(groupOfStore(g, 'Aldi')?.id).toBe('fam');
    expect(groupOfStore(g, '')?.id).toBe('fam');
    expect(purchasesOf(g, month).map(p => [p.store, p.parties])).toEqual([["BJ's", [ME, 'sis', 'mom']], ['Aldi', [ME, 'sis', 'mom']]]);
  });
  it('yields to the store\'s own group, and to an item or line that names its people', () => {
    const own: GroceryGroup = { id: 'pal', n: 'Pals', people: [{ id: 'bo', n: 'Bo' }], stores: ['Aldi'] };
    const g2: Grocery = { ...g, groups: [family, own] };
    expect(groupOfStore(g2, 'Aldi')?.id).toBe('pal');
    expect(groupOfStore(g2, "BJ's")?.id).toBe('fam');
    expect(partiesFor(g, g.items.find(i => i.id === 'tea')!)).toEqual([ME]);
    expect(partiesFor(g, g.items[0]!, { got: true, share: { with: ['mom'] } })).toEqual([ME, 'mom']);
  });
  it('is ignored once its group is gone, and a list without it is unchanged', () => {
    expect(groupOfStore({ ...g, groups: [{ ...family, gone: true }] }, 'Aldi')).toBeUndefined();
    const plain: Grocery = { ...g, groups: [{ ...family, allStores: undefined }] };
    expect(groupOfStore(plain, 'Aldi')).toBeUndefined();
  });
});

describe('byStore', () => {
  it('tags a store with no group of its own, and the Anywhere section, with the All stores group, and puts them first, with sharing on only', () => {
    const own: GroceryGroup = { id: 'pal', n: 'Pals', people: [{ id: 'bo', n: 'Bo' }], stores: ['Aldi'] };
    const rows = byStore({ ...g, groups: [family, own] }, g.items, true);
    expect(rows.filter(r => r.group).map(r => [r.store, r.group!.id])).toEqual([['BJ\'s', 'fam'], ['Aldi', 'pal'], ['Lidl', 'fam'], ['', 'fam']]);
    expect(byStore(g, g.items, false).some(r => r.group)).toBe(false);
  });
});

describe('cleaning the flag', () => {
  it('keeps it through cleaning and the strict check, and refuses any other value', () => {
    expect(normGroceryGroup(family)).toEqual(family);
    expect(validGroceryGroup(family)).toBe(true);
    expect(validGroceryGroup({ ...family, allStores: false })).toBe(false);
    expect('allStores' in normGroceryGroup({ ...family, allStores: 'yes' })!).toBe(false);
  });
  it('keeps one live group with it (the first), and never a group that is gone', () => {
    const two = normGrocery({ stores: ['A'], items: [], groups: [{ ...family, id: 'a' }, { ...family, id: 'b' }, { ...family, id: 'c', gone: true }] });
    expect(two.groups!.map(x => !!x.allStores)).toEqual([true, false, false]);
  });
});

describe('acrossStores', () => {
  it('nets each person over the stores, and its total is what monthOwes says', () => {
    const a = acrossStores(g, month)!;
    expect(a.people.map(p => [p.id, p.cents])).toEqual([['sis', 700], ['mom', 1000]]); // sis: +1000 at BJ's, -300 at Aldi
    expect(a.people[0]!.parts).toEqual([{ store: "BJ's", cents: 1000 }, { store: 'Aldi', cents: -300 }]);
    const { owed, youOwe } = monthOwes(g, month);
    expect(a.net).toBe(owed - youOwe);
  });
  it('leaves out a row marked settled, and rows between two other people', () => {
    const settled: GroceryMonth = { ...month, paid: { [paidKey("BJ's", ME, 'mom')]: 1000 } };
    const a = acrossStores(g, settled)!;
    expect(a.people.map(p => p.id)).toEqual(['sis']); // mom's Aldi row is owed to Sister, not to you, so it never shows
    expect(a.net).toBe(700);
  });
  it('is null with one store, with no group, or when nothing is owed', () => {
    expect(acrossStores(g, { lines: { tp: { got: true } }, pulled: [] })).toBeNull();
    expect(acrossStores({ ...g, groups: [] }, month)).toBeNull();
    expect(acrossStores(g, { lines: { tea: { got: true }, tp: { got: true, share: { with: [] } } }, pulled: [] })).toBeNull();
  });
});
