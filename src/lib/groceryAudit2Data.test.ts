import { describe, expect, it } from 'vitest';
import { ME, addTax, settle, splitCents, totalsOf } from './grocerySplit.js';
import { MAX_PEOPLE, normGroceryGroup, normGroceryItem, normGroceryStore, cleanShare, validGroceryGroup, validGroceryStore } from '../shared/grocery.js';

// Closing audit 2: N-3 (gone people limit), N-7 (tax with no priced subtotal), N-9 (ids named like Object.prototype members).
const people = (live: number, gone: number) => [
  ...Array.from({ length: live }, (_, i) => ({ id: `l${i}`, n: `Live ${i}` })),
  ...Array.from({ length: gone }, (_, i) => ({ id: `g${i}`, n: `Gone ${i}`, gone: true as const })),
];
const group = (p: ReturnType<typeof people>) => ({ id: 'g', n: 'Home', people: p, stores: [] as string[] });

describe('N-3: the cleaner and the server check use the same people limits', () => {
  it('keeps a group of 10 live and 10 gone people whole', () => {
    const g = group(people(MAX_PEOPLE, MAX_PEOPLE));
    expect(validGroceryGroup(g)).toBe(true);
    expect(normGroceryGroup(g)?.people).toHaveLength(MAX_PEOPLE * 2);
  });
  it('keeps a group of 20 gone people (a removed group)', () => {
    const g = group(people(0, MAX_PEOPLE * 2));
    expect(validGroceryGroup(g)).toBe(true);
    expect(normGroceryGroup(g)?.people).toHaveLength(MAX_PEOPLE * 2);
  });
  it('still caps live people at MAX_PEOPLE and the total at twice that', () => {
    expect(normGroceryGroup(group(people(MAX_PEOPLE + 3, 0)))?.people).toHaveLength(MAX_PEOPLE);
    expect(normGroceryGroup(group(people(MAX_PEOPLE, MAX_PEOPLE + 5)))?.people).toHaveLength(MAX_PEOPLE * 2);
    expect(validGroceryGroup(group(people(MAX_PEOPLE, MAX_PEOPLE + 1)))).toBe(false);
  });
});

describe('N-7: tax with nothing priced is yours alone, so the bill is the sum of the shares', () => {
  it('addTax gives the tax to you when the subtotal is zero', () => {
    const t = addTax({ [ME]: 0, bob: 0 }, 80);
    expect(t[ME]).toBe(80); expect(t.bob).toBe(0);
  });
  it('settle: bill, share and what is owed agree for an unpriced purchase with receipt tax', () => {
    const s = settle([{ cents: 0, parties: [ME, 'bob'] }], ME, new Set(), 80);
    expect(s.bill).toBe(80);
    expect(s.yourShare).toBe(80);
    expect(s.owedToYou).toBe(0);
  });
});

describe('N-9: ids named like Object.prototype members', () => {
  it('splitCents, totalsOf and addTax treat "constructor" as a person', () => {
    expect(splitCents(1000, [ME, 'constructor'])).toEqual({ constructor: 500, [ME]: 500 });
    expect(totalsOf([{ cents: 1000, parties: [ME, 'toString'] }, { cents: 600, parties: ['toString'] }])).toEqual({ toString: 1100, [ME]: 500 });
    expect(addTax({ [ME]: 500, constructor: 500 }, 100)).toEqual({ [ME]: 550, constructor: 550 });
    const t = totalsOf([{ cents: 1000, parties: [ME, 'constructor'] }]);
    expect(Object.values(t).every(v => typeof v === 'number')).toBe(true);
  });
  it('the cleaners refuse such ids for people, groups, items, stores and shares', () => {
    for (const bad of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf']) {
      expect(normGroceryGroup({ id: 'g', n: 'Home', people: [{ id: bad, n: 'X' }], stores: [] })?.people).toEqual([]);
      expect(validGroceryGroup({ id: 'g', n: 'Home', people: [{ id: bad, n: 'X' }], stores: [] })).toBe(false);
      expect(normGroceryGroup({ id: bad, n: 'Home', people: [], stores: [] })).toBeNull();
      expect(normGroceryItem({ id: bad, n: 'Milk', store: '', qty: 1, cents: 1, every: true })).toBeNull();
      expect(normGroceryStore({ n: bad })).toBeNull();
      expect(validGroceryStore({ id: bad, n: bad })).toBe(false);
      expect(cleanShare({ with: [bad, 'ok'] })).toEqual({ with: ['ok'] });
    }
  });
});
