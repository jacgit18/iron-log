import { describe, expect, it } from 'vitest';
import { desiredRows, documentFor, parsePath, scopeRows, type PathKind } from './documents.js';
import { mergeGroceryMonth3 } from './merge.js';
import { fromServerRow } from './rows.js';
import { mirrorOf, serverRow } from './testing.js';
import { LIST_NAMES, validateSaveListItem } from '../shared/commands.js';
import type { Grocery, GroceryMonth } from '../types.ts';

const kind = (path: string) => parsePath(path) as PathKind;
const share = { with: ['sis'] };
const g: Grocery = {
  stores: ["BJ's", 'Aldi'],
  items: [{ id: 'rice', n: 'Rice', store: "BJ's", qty: 1, cents: 1499, every: true, out: false, share }],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom', covered: true }], stores: ["BJ's"] }],
};

describe('sharing groups sync as list rows', () => {
  it('a group is a grocery_group row, and the catalogue reads back with its groups and item shares', () => {
    const rows = desiredRows(kind('grocery/main'), g, new Map());
    expect(rows.map(r => r.key)).toEqual(["grocery_store/BJ's", 'grocery_store/Aldi', 'grocery_item/rice', 'grocery_group/g1']);
    expect(documentFor(kind('grocery/main'), mirrorOf(rows))).toEqual(g);
  });
  it('a list with no groups makes no group rows and reads back unchanged', () => {
    const plain: Grocery = { stores: ['Aldi'], items: [] };
    const rows = desiredRows(kind('grocery/main'), plain, new Map());
    expect(rows.some(r => r.table === 'list_items' && r.list === 'grocery_group')).toBe(false);
    expect(documentFor(kind('grocery/main'), mirrorOf(rows))).toEqual(plain);
  });
  it('group rows belong to the grocery document and nothing else', () => {
    const m = mirrorOf(desiredRows(kind('grocery/main'), g, new Map()));
    expect(scopeRows(kind('grocery/main'), m).filter(r => r.table === 'list_items' && r.list === 'grocery_group')).toHaveLength(1);
    expect(scopeRows(kind('stretches/main'), m)).toEqual([]);
  });
  it('a group row survives the server row shape', () => {
    const back = fromServerRow('list_items', serverRow({ list: 'grocery_group', client_id: 'g1', position: 0, data: g.groups![0] }));
    expect(back).toMatchObject({ table: 'list_items', list: 'grocery_group', key: 'grocery_group/g1', item: g.groups![0] });
  });
  it('the API accepts a group and refuses a malformed one', () => {
    expect(LIST_NAMES).toContain('grocery_group');
    expect(validateSaveListItem({ list: 'grocery_group', item: g.groups![0], position: 0 })).toMatchObject({ list: 'grocery_group' });
    expect(validateSaveListItem({ list: 'grocery_group', item: { ...g.groups![0], n: ' padded' }, position: 0 })).toBeNull();
    expect(validateSaveListItem({ list: 'grocery_group', item: { ...g.groups![0], people: [{ id: 'me', n: 'Me' }] }, position: 0 })).toBeNull();
  });
});

describe('a month with shares and a payer', () => {
  const month: GroceryMonth = {
    lines: { chicken: { got: true, prices: [899, 1049, 925], share, packShares: [null, { with: ['sis', 'mom'] }, { with: ['sis'], notMine: true }] } },
    pulled: [], payer: { "BJ's": 'mom' },
  };
  it('round-trips through its row', () => {
    const rows = desiredRows(kind('grocery/2026-10'), month, new Map());
    expect(rows).toHaveLength(1);
    expect(documentFor(kind('grocery/2026-10'), mirrorOf(rows))).toEqual(month);
  });
  it('merges who paid store by store, so two devices keep both answers', () => {
    const base: GroceryMonth = { lines: {}, pulled: [], payer: { Aldi: 'a' } };
    const ours: GroceryMonth = { lines: {}, pulled: [], payer: { Aldi: 'a', "BJ's": 'mom' } };
    const theirs: GroceryMonth = { lines: {}, pulled: [], payer: { Aldi: 'a', Costco: 'sis' } };
    expect(mergeGroceryMonth3(base, ours, theirs).week.payer).toEqual({ Aldi: 'a', "BJ's": 'mom', Costco: 'sis' });
  });
  it('without a base, this device wins where both set the same store', () => {
    const ours: GroceryMonth = { lines: {}, pulled: [], payer: { "BJ's": 'mom' } };
    const theirs: GroceryMonth = { lines: {}, pulled: [], payer: { "BJ's": 'sis', Aldi: 'x' } };
    expect(mergeGroceryMonth3(null, ours, theirs).week.payer).toEqual({ "BJ's": 'mom', Aldi: 'x' });
  });
  it('keeps one device\'s pack share when the other changed a different field of the same line', () => {
    const base: GroceryMonth = { lines: { c: { prices: [100, 200] } }, pulled: [] };
    const ours: GroceryMonth = { lines: { c: { prices: [100, 200], packShares: [{ with: ['sis'] }, null] } }, pulled: [] };
    const theirs: GroceryMonth = { lines: { c: { prices: [100, 200], got: true } }, pulled: [] };
    expect(mergeGroceryMonth3(base, ours, theirs).week.lines.c).toEqual({ prices: [100, 200], got: true, packShares: [{ with: ['sis'] }, null] });
  });
});

describe('a list that uses no sharing is unchanged', () => {
  // What the app wrote before sharing existed. Cleaning, syncing and reading it back must give the same bytes, so adding the feature
  // cannot alter anyone's list until they use it.
  const legacy: Grocery = {
    stores: ['Aldi', "BJ's"],
    items: [
      { id: 'rice', n: 'Rice', store: 'Aldi', qty: 2, cents: 349, every: true, out: false, note: 'long grain' },
      { id: 'beef', n: 'Beef', store: "BJ's", qty: 1.5, cents: 899, every: true, out: false, unit: 'lb' },
    ],
  };
  const legacyMonth: GroceryMonth = {
    lines: { rice: { got: true, qty: 2, cents: 300 }, beef: { got: true, prices: [899, 1049] }, kale: { have: true } },
    pulled: ['old'],
  };
  it('the catalogue is the same bytes after cleaning, and makes no group rows', () => {
    const rows = desiredRows(kind('grocery/main'), legacy, new Map());
    expect(rows.some(r => r.table === 'list_items' && r.list === 'grocery_group')).toBe(false);
    expect(JSON.stringify(documentFor(kind('grocery/main'), mirrorOf(rows)))).toBe(JSON.stringify(legacy));
  });
  it('a month is the same bytes after cleaning and after a trip through its row', () => {
    const rows = desiredRows(kind('grocery/2026-10'), legacyMonth, new Map());
    expect(JSON.stringify(documentFor(kind('grocery/2026-10'), mirrorOf(rows)))).toBe(JSON.stringify(legacyMonth));
  });
  it('merging two copies of an unshared month adds no sharing keys', () => {
    const merged = mergeGroceryMonth3(legacyMonth, legacyMonth, { ...legacyMonth, lines: { ...legacyMonth.lines, rice: { got: true, qty: 3, cents: 300 } } }).week;
    expect(Object.keys(merged).sort()).toEqual(['lines', 'pulled']);
    expect(merged.lines.rice).toEqual({ got: true, qty: 3, cents: 300 });
  });
});
