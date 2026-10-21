import { describe, expect, it } from 'vitest';
import { groupOfStore, purchasesOf } from './grocerySettle.js';
import { ME } from './grocerySplit.js';
import type { Grocery } from '../types.ts';

const g: Grocery = {
  stores: ["BJ's"],
  items: [{ id: 'tp', n: 'tp', store: "BJ's", qty: 1, cents: 2000, every: true, out: false }],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }], stores: ["BJ's"], gone: true }],
};

describe('a group that is gone', () => {
  it('stops being the default split of its stores', () => {
    expect(groupOfStore(g, "BJ's")).toBeUndefined();
    expect(purchasesOf(g, { lines: { tp: { got: true } }, pulled: [] })[0]!.parties).toEqual([ME]);
  });
  it('a live group still is', () => {
    const { gone: _, ...open } = g.groups![0]!;
    const live: Grocery = { ...g, groups: [open] };
    expect(groupOfStore(live, "BJ's")?.id).toBe('g1');
  });
});
