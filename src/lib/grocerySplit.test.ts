import { describe, expect, it } from 'vitest';
import { ME, partiesOf, settle, splitCents, totalsOf } from './grocerySplit.js';
import type { GroceryGroup } from '../types.ts';

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, c) => a + c, 0);
const group: GroceryGroup = { id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom', covered: true }], stores: [] };
const known = new Set(['sis', 'mom']);

describe('splitCents', () => {
  it('gives just you the whole price', () => expect(splitCents(1049, [ME])).toEqual({ [ME]: 1049 }));
  it('splits evenly and the shares add up', () => {
    const r = splitCents(2499, [ME, 'sis', 'mom']);
    expect(r).toEqual({ sis: 833, mom: 833, [ME]: 833 });
    expect(sum(r)).toBe(2499);
  });
  it('puts the odd cent on you, never on the others', () => {
    const r = splitCents(899, [ME, 'sis', 'mom']);
    expect(r.sis).toBe(300); expect(r.mom).toBe(300); expect(r[ME]).toBe(299);
    expect(sum(r)).toBe(899);
  });
  it('never gives anyone a negative share, even for a tiny price among many', () => {
    const r = splitCents(3, [ME, 'a', 'b', 'c', 'd', 'e']);
    expect(Object.values(r).every(c => c >= 0)).toBe(true);
    expect(sum(r)).toBe(3);
  });
  it('for something that is not yours, the last person takes the odd cent and you owe nothing', () => {
    const r = splitCents(899, ['sis', 'mom']);
    expect(r[ME]).toBeUndefined();
    expect(r).toEqual({ sis: 450, mom: 449 });
  });
  it('is exact for zero and for every size of group up to ten', () => {
    expect(splitCents(0, [ME, 'a'])).toEqual({ a: 0, [ME]: 0 });
    for (let k = 1; k <= 10; k++) for (const c of [1, 2, 7, 99, 100, 1234, 99_999_999]) {
      const parties = [ME, ...Array.from({ length: k - 1 }, (_, i) => `p${i}`)];
      const r = splitCents(c, parties);
      expect(sum(r)).toBe(c);
      expect(Object.values(r).every(v => Number.isInteger(v) && v >= 0)).toBe(true);
    }
  });
});

describe('partiesOf', () => {
  it('is just you with no share and no store group', () => expect(partiesOf(undefined, undefined, known)).toEqual([ME]));
  it('uses everyone in the store group by default', () => expect(partiesOf(undefined, group, known)).toEqual([ME, 'sis', 'mom']));
  it('lets a purchase override the store group', () => {
    expect(partiesOf({ with: [] }, group, known)).toEqual([ME]);
    expect(partiesOf({ with: ['sis'] }, group, known)).toEqual([ME, 'sis']);
  });
  it('handles "not mine" and falls back to you when nobody is left', () => {
    expect(partiesOf({ with: ['sis', 'mom'], notMine: true }, group, known)).toEqual(['sis', 'mom']);
    expect(partiesOf({ with: ['gone'], notMine: true }, group, known)).toEqual([ME]);
  });
  it('drops a person who was removed', () => expect(partiesOf({ with: ['sis', 'gone'] }, undefined, known)).toEqual([ME, 'sis']));
});

describe('settle', () => {
  // The BJ's example: you pay, a sister and a mom share the common things; two chicken packs are only yours; one is for everyone.
  const buys = [
    { cents: 2499, parties: [ME, 'sis', 'mom'] }, { cents: 2199, parties: [ME, 'sis', 'mom'] },
    { cents: 1049, parties: [ME] }, { cents: 925, parties: [ME] },
    { cents: 899, parties: [ME, 'sis', 'mom'] }, { cents: 1799, parties: [ME, 'sis', 'mom'] },
  ];
  it('adds up to the bill and asks only the people who are not covered', () => {
    const s = settle(buys, ME, new Set(['mom']));
    expect(s.bill).toBe(9370);
    expect(s.yourShare + s.rows.reduce((a, r) => a + r.cents, 0)).toBe(s.bill);
    expect(s.rows.find(r => r.id === 'sis')).toEqual({ id: 'sis', kind: 'owesYou', cents: 2466 });
    expect(s.rows.find(r => r.id === 'mom')?.kind).toBe('covered');
    expect(s.owedToYou).toBe(2466);
    expect(s.yourShare).toBe(4438);
  });
  it('when someone else paid, you owe them your share', () => {
    const s = settle(buys, 'mom', new Set());
    expect(s.youOwe).toBe(4438);
    expect(s.rows[0]).toEqual({ id: 'mom', kind: 'youOwe', cents: 4438 });
    expect(s.rows.find(r => r.id === 'sis')?.kind).toBe('owesPayer');
    expect(s.owedToYou).toBe(0);
  });
  it('a purchase that is all yours settles nothing', () => {
    const s = settle([{ cents: 1500, parties: [ME] }], ME, new Set());
    expect(s).toEqual({ bill: 1500, yourShare: 1500, owedToYou: 0, youOwe: 0, rows: [] });
  });
  it('a purchase that is not yours is all owed to you', () => {
    const s = settle([{ cents: 899, parties: ['sis', 'mom'] }], ME, new Set());
    expect(s.yourShare).toBe(0); expect(s.owedToYou).toBe(899);
  });
  it('totalsOf matches the sum of the splits', () => expect(sum(totalsOf(buys))).toBe(9370));
});
