import { describe, expect, it } from 'vitest';
import { cleanShare, cleanTax, normGroceryGroup, normGroceryItem, normGroceryMonth, normGroceryStore, validGroceryGroup, validGroceryItem, validGroceryStore, validShare } from '../shared/grocery.js';
import { mergeGrocery, monthEmpty, normGrocery, normGroceryData } from './grocery.js';
import type { GroceryData, GroceryGroup } from '../types.ts';

const group = (o: Partial<GroceryGroup> = {}): GroceryGroup => ({ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom', covered: true }], stores: ["BJ's"], ...o });
const item = { id: 'rice', n: 'Rice', store: "BJ's", qty: 1, cents: 1499, every: true, out: false };

describe('shares', () => {
  it('cleans a share to people ids, deduped, and keeps "not mine" only when there is someone', () => {
    expect(cleanShare({ with: ['a', 'a', 'b'] })).toEqual({ with: ['a', 'b'] });
    expect(cleanShare({ with: [] })).toEqual({ with: [] });
    expect(cleanShare({ with: [], notMine: true })).toEqual({ with: [] });
    expect(cleanShare({ with: ['a'], notMine: true })).toEqual({ with: ['a'], notMine: true });
    for (const bad of [null, 5, 'x', [], {}, { with: 'a' }]) expect(cleanShare(bad)).toBeNull();
  });
  it('validShare accepts only what the app writes', () => {
    expect(validShare({ with: ['a'] })).toBe(true);
    expect(validShare({ with: ['a'], notMine: true })).toBe(true);
    expect(validShare({ with: ['a', 'a'] })).toBe(false);
    expect(validShare({ with: ['a'], extra: 1 })).toBe(false);
    expect(validShare({ with: [], notMine: true })).toBe(false);
  });
  it('an item keeps its share through cleaning and the strict check, and an old item has none', () => {
    const s = { with: ['sis'] };
    expect(normGroceryItem({ ...item, share: s })).toMatchObject({ share: s });
    expect(validGroceryItem({ ...item, share: s })).toBe(true);
    expect(validGroceryItem({ ...item, share: { with: 'x' } })).toBe(false);
    expect('share' in normGroceryItem(item)!).toBe(false);
  });
});

describe('groups', () => {
  it('cleans a group: caps and dedupes people and stores, and "me" is not a person', () => {
    const g = normGroceryGroup({ id: 'g', n: ' Home ', people: [{ id: 'a', n: 'A' }, { id: 'a', n: 'Dup' }, { id: 'me', n: 'Me' }, { id: 'b', n: 'B', covered: true }, { n: 'no id' }], stores: ['X', 'X', ''] });
    expect(g).toEqual({ id: 'g', n: 'Home', people: [{ id: 'a', n: 'A' }, { id: 'b', n: 'B', covered: true }], stores: ['X'] });
    expect(normGroceryGroup({ id: 'g' })).toBeNull();
    expect(normGroceryGroup(null)).toBeNull();
    const many = normGroceryGroup({ id: 'g', n: 'Big', people: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, n: `P${i}` })) });
    expect(many!.people).toHaveLength(10);
  });
  it('the strict check refuses a duplicate person, "me", an untrimmed name and a long name', () => {
    expect(validGroceryGroup(group())).toBe(true);
    expect(validGroceryGroup(group({ people: [{ id: 'a', n: 'A' }, { id: 'a', n: 'B' }] }))).toBe(false);
    expect(validGroceryGroup(group({ people: [{ id: 'me', n: 'A' }] }))).toBe(false);
    expect(validGroceryGroup(group({ n: ' Home' }))).toBe(false);
    expect(validGroceryGroup(group({ n: 'x'.repeat(41) }))).toBe(false);
    expect(validGroceryGroup(group({ stores: ['A', 'A'] }))).toBe(false);
  });
  it('normGrocery leaves groups out when there are none, so an ordinary list is unchanged', () => {
    expect(normGrocery(null)).toEqual({ stores: [], items: [] });
    expect('groups' in normGrocery({ stores: ['A'], items: [] })).toBe(false);
  });
  it('normGrocery drops a store a group names that is not in the list, and a store defaults to one group only', () => {
    const g = normGrocery({ stores: ["BJ's", 'Aldi'], items: [], groups: [group({ stores: ["BJ's", 'Gone'] }), group({ id: 'g2', n: 'Other', stores: ["BJ's", 'Aldi'] })] });
    expect(g.groups!.map(x => x.stores)).toEqual([["BJ's"], ['Aldi']]);
  });
  it('a data file with only a group is not empty', () => {
    expect(normGroceryData({ stores: [], items: [], groups: [group({ stores: [] })] })).toMatchObject({ groups: [{ id: 'g1' }] });
  });
});

describe('a month', () => {
  it('keeps a line share, pack shares in step with the prices, and who paid', () => {
    const m = normGroceryMonth({ lines: { chicken: { got: true, prices: [899, 1049, 925], share: { with: ['sis'] }, packShares: [null, { with: ['sis', 'mom'] }] } }, pulled: [], payer: { "BJ's": 'mom' } });
    expect(m.lines.chicken!.share).toEqual({ with: ['sis'] });
    expect(m.lines.chicken!.packShares).toEqual([null, { with: ['sis', 'mom'] }, null]); // padded to three packs
    expect(m.payer).toEqual({ "BJ's": 'mom' });
  });
  it('drops pack shares when the line has no per-pack prices or none is set', () => {
    expect('packShares' in normGroceryMonth({ lines: { a: { got: true, qty: 2, cents: 100, packShares: [{ with: ['x'] }] } }, pulled: [] }).lines.a!).toBe(false);
    expect('packShares' in normGroceryMonth({ lines: { a: { prices: [1, 2], packShares: [null, null] } }, pulled: [] }).lines.a!).toBe(false);
  });
  it('ignores a payer that is "me" or not a string, and an old month has no payer key', () => {
    expect(normGroceryMonth({ lines: {}, pulled: [], payer: { A: 'me', B: 5, C: 'x' } }).payer).toEqual({ C: 'x' });
    expect('payer' in normGroceryMonth({ lines: { a: { got: true } }, pulled: [] })).toBe(false);
  });
  it('a month with only a payer is not empty', () => {
    expect(monthEmpty(normGroceryMonth({ lines: {}, pulled: [], payer: { A: 'x' } }))).toBe(false);
    expect(monthEmpty(normGroceryMonth({ lines: {}, pulled: [] }))).toBe(true);
  });
});

describe('add to my data', () => {
  const inc = (o: Partial<GroceryData> = {}): GroceryData => ({ stores: ["BJ's"], items: [item], groups: [group()], months: {}, ...o });
  it('adds a group the file has and this list does not, keeping its people ids and the stores that exist here', () => {
    const r = mergeGrocery({ stores: ["BJ's"], items: [] }, {}, inc());
    expect(r.changed).toBe(true);
    expect(r.grocery.groups).toEqual([group()]);
  });
  it('keeps the group already here and does not default one store to two groups', () => {
    const cur = { stores: ["BJ's"], items: [], groups: [group({ id: 'mine', n: 'Mine' })] };
    const r = mergeGrocery(cur, {}, inc());
    expect(r.grocery.groups!.map(g => [g.id, g.stores])).toEqual([['mine', ["BJ's"]], ['g1', []]]);
  });
  it('is a no-op when the group is already here', () => {
    expect(mergeGrocery({ stores: ["BJ's"], items: [item], groups: [group()] }, {}, inc()).changed).toBe(false);
  });
  it('carries who paid, and keeps this list\'s answer where both have one', () => {
    const cur = { stores: ["BJ's"], items: [item] };
    const r = mergeGrocery(cur, { '2026-10': { lines: { rice: { got: true } }, pulled: [], payer: { "BJ's": 'mine' } } },
      inc({ months: { '2026-10': { lines: { rice: { got: true } }, pulled: [], payer: { "BJ's": 'theirs', Aldi: 'x' } } } }));
    expect(r.months['2026-10']!.payer).toEqual({ "BJ's": 'mine', Aldi: 'x' });
  });
});

describe('store tax', () => {
  it('a rate is a whole number of thousandths of a percent from 1 to 30000', () => {
    expect(cleanTax(8875)).toBe(8875);
    for (const bad of [0, -1, 30001, 8.5, '8875', null, undefined, NaN]) expect(cleanTax(bad), String(bad)).toBeNull();
  });
  it('a store row keeps a good rate, drops a bad one, and the strict check refuses a bad one', () => {
    expect(normGroceryStore({ n: "BJ's", tax: 8875 })).toEqual({ id: "BJ's", n: "BJ's", tax: 8875 });
    expect(normGroceryStore({ n: "BJ's", tax: 99999 })).toEqual({ id: "BJ's", n: "BJ's" });
    expect('tax' in normGroceryStore({ id: 'Aldi', n: 'Aldi' })!).toBe(false); // an older store row has none
    expect(validGroceryStore({ id: "BJ's", n: "BJ's", tax: 8875 })).toBe(true);
    expect(validGroceryStore({ id: "BJ's", n: "BJ's" })).toBe(true);
    expect(validGroceryStore({ id: "BJ's", n: "BJ's", tax: 0 })).toBe(false);
    expect(validGroceryStore({ id: "BJ's", n: "BJ's", tax: '8.875' })).toBe(false);
  });
  it('the catalogue keeps taxes only for stores that exist, and a new store brings its tax on import', () => {
    const g = normGrocery({ stores: ["BJ's"], items: [], taxes: { "BJ's": 8875, Gone: 7000, Bad: 99999 } });
    expect(g.taxes).toEqual({ "BJ's": 8875 });
    expect(normGrocery({ stores: ["BJ's"], items: [], taxes: { "BJ's": 0 } }).taxes).toBeUndefined();
    const inc: GroceryData = { stores: ["BJ's", 'Aldi'], items: [], taxes: { "BJ's": 5000, Aldi: 7000 }, months: {} };
    const r = mergeGrocery({ stores: ["BJ's"], items: [], taxes: { "BJ's": 8875 } }, {}, inc);
    expect(r.grocery.taxes).toEqual({ "BJ's": 8875, Aldi: 7000 }); // BJ's keeps its own, Aldi is new and brings its own
  });
});
