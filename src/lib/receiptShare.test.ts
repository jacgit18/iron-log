import { describe, expect, it } from 'vitest';
import { NO_CHOICES, applyShares, isOwnRow, owedText, rowParties, setRow, setWhole, shareForRow, shareWrites, wholeParties } from './receiptShare.js';
import { ME } from './grocerySplit.js';
import type { Grocery, GroceryItem, GroceryMonth } from '../types.ts';

const sam = { id: 'sam', n: 'Sam' }, alex = { id: 'alex', n: 'Alex' };
const item = (id: string, store = 'Harvest'): GroceryItem => ({ id, n: id, store, qty: 1, cents: null, every: true, out: false });
const g = (over: Partial<Grocery> = {}): Grocery => ({ stores: ['Harvest'], items: [item('milk'), item('bread')], groups: [{ id: 'g1', n: 'Home', people: [sam, alex], stores: [] }], ...over });
const month = (over: Partial<GroceryMonth> = {}): GroceryMonth => ({ lines: {}, pulled: [], ...over });

describe('share choices', () => {
  it('a row follows the whole receipt until it has its own split', () => {
    const c = setWhole(NO_CHOICES, { with: ['sam'] });
    expect(shareForRow(c, 'a')).toEqual({ with: ['sam'] });
    const own = setRow(c, 'a', { with: [] });
    expect(shareForRow(own, 'a')).toEqual({ with: [] });
    expect(shareForRow(own, 'b')).toEqual({ with: ['sam'] });
    expect(isOwnRow(own, 'a')).toBe(true);
  });
  it('clearing a row hands it back to the whole receipt, and nothing chosen is the usual', () => {
    const c = setRow(setWhole(NO_CHOICES, { with: ['sam'] }), 'a', { with: [] });
    expect(shareForRow(setRow(c, 'a', null), 'a')).toEqual({ with: ['sam'] });
    expect(shareForRow(NO_CHOICES, 'a')).toBeNull();
  });
  it('does not change the choices it was given', () => {
    const c = setWhole(NO_CHOICES, { with: ['sam'] });
    setRow(c, 'a', { with: [] });
    expect(c.rows).toEqual({});
  });
});

describe('rowParties and wholeParties', () => {
  it('a chosen split names its people, and drops a person who no longer exists', () => {
    expect(rowParties(g(), item('milk'), undefined, { with: ['sam', 'ghost'] })).toEqual([ME, 'sam']);
    expect(rowParties(g(), item('milk'), undefined, { with: ['sam'], notMine: true })).toEqual(['sam']);
  });
  it('with nothing chosen it is the item or store split, else just you', () => {
    expect(rowParties(g(), item('milk'), undefined, null)).toEqual([ME]);
    const home = g({ groups: [{ id: 'g1', n: 'Home', people: [sam, alex], stores: ['Harvest'] }] });
    expect(rowParties(home, item('milk'), undefined, null)).toEqual([ME, 'sam', 'alex']);
    expect(rowParties(g(), undefined, undefined, null)).toEqual([ME]);
  });
  it('the whole picker shows the whole split, else the first ticked row usual', () => {
    expect(wholeParties(g(), setWhole(NO_CHOICES, { with: ['alex'] }), [[ME]])).toEqual([ME, 'alex']);
    expect(wholeParties(g(), NO_CHOICES, [undefined, [ME, 'sam']])).toEqual([ME, 'sam']);
    expect(wholeParties(g(), NO_CHOICES, [])).toEqual([ME]);
  });
});

describe('owedText', () => {
  const rows = [{ cents: 429, parties: [ME, 'sam'] }, { cents: 399, parties: [ME] }];
  it('says what each person owes you and your share', () => {
    expect(owedText(g(), month(), 'Harvest', rows, [sam, alex])).toBe('Sam owes you $2.15 · your share $6.13');
  });
  it('names everyone who owes, in order', () => {
    expect(owedText(g(), month(), 'Harvest', [{ cents: 900, parties: [ME, 'sam', 'alex'] }], [sam, alex])).toBe('Sam owes you $3.00 · Alex owes you $3.00 · your share $3.00');
  });
  it('says all yours, nothing yours, and nothing when no row is ticked', () => {
    expect(owedText(g(), month(), 'Harvest', [{ cents: 500, parties: [ME] }], [sam])).toBe('All yours: $5.00');
    expect(owedText(g(), month(), 'Harvest', [], [sam])).toBe('');
  });
  it('a purchase made for others only leaves you nothing', () => {
    expect(owedText(g(), month(), 'Harvest', [{ cents: 500, parties: ['sam'] }], [sam])).toBe('Sam owes you $5.00 · your share $0.00');
  });
  it('when someone else paid for the store only your share is said', () => {
    const m = month({ payer: { Harvest: 'sam' } });
    expect(owedText(g(), m, 'Harvest', rows, [sam, alex])).toBe('Your share $6.13');
  });
});

describe('shareWrites and applyShares', () => {
  const rows = [
    { key: 'a', itemId: 'milk', include: true, cents: 429 },
    { key: 'b', itemId: 'bread', include: true, cents: 399 },
    { key: 'c', itemId: 'milk', include: true, cents: 100 },
    { key: 'd', itemId: 'eggs', include: false, cents: 300 },
    { key: 'e', itemId: null, include: true, cents: 849 },
  ];
  it('writes nothing when no split was chosen', () => expect(shareWrites(NO_CHOICES, rows)).toEqual([]));
  it('writes the whole split to each ticked item once', () => {
    expect(shareWrites(setWhole(NO_CHOICES, { with: ['sam'] }), rows)).toEqual([{ id: 'milk', share: { with: ['sam'] } }, { id: 'bread', share: { with: ['sam'] } }]);
  });
  it('a row own split beats the whole one, and the first row of an item decides', () => {
    const c = setRow(setWhole(NO_CHOICES, { with: ['sam'] }), 'b', { with: [] });
    expect(shareWrites(c, rows)).toEqual([{ id: 'milk', share: { with: ['sam'] } }, { id: 'bread', share: { with: [] } }]);
    expect(shareWrites(setRow(NO_CHOICES, 'c', { with: ['alex'] }), rows)).toEqual([]);
  });
  it('an item added on the sheet is written under its real id', () => {
    const r = [{ key: 'a', itemId: 'new:1', include: true, cents: 849 }];
    expect(shareWrites(setWhole(NO_CHOICES, { with: ['sam'] }), r, new Map([['new:1', 'i9']]))).toEqual([{ id: 'i9', share: { with: ['sam'] } }]);
  });
  it('applyShares calls the store once per write and counts them', () => {
    const calls: string[] = [];
    const n = applyShares([{ id: 'milk', share: { with: ['sam'] } }, { id: 'bread', share: { with: [] } }], '2026-11', { setGroceryReceiptShare: (m, id, s) => { calls.push(`${m} ${id} ${JSON.stringify(s)}`); } });
    expect(n).toBe(2);
    expect(calls).toEqual(['2026-11 milk {"with":["sam"]}', '2026-11 bread {"with":[]}']);
  });
});
