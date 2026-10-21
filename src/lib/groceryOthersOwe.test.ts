import { describe, expect, it } from 'vitest';
import { paidKey } from './grocery.js';
import { monthOthersOwe } from './grocerySettle.js';
import type { Grocery, GroceryMonth } from '../types.ts';

const item = (id: string, n: string, store = '') => ({ id, n, store, qty: 1, cents: 300, every: true, out: false });

describe('monthOthersOwe (audit Y-8)', () => {
  const groups = [{ id: 'g1', n: 'Run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom' }], stores: ['BJs'] }];
  const g: Grocery = { stores: ['BJs'], items: [{ ...item('tp', 'Paper', 'BJs'), cents: 2000, share: { with: ['sis', 'mom'], notMine: true } }], groups };
  it('is what is unpaid between other people, which the header must not call settled', () => {
    const m: GroceryMonth = { lines: { tp: { got: true } }, pulled: [], payer: { BJs: 'mom' } };
    expect(monthOthersOwe(g, m)).toBe(1000);
  });
  it('drops once the row is marked paid', () => {
    const m: GroceryMonth = { lines: { tp: { got: true } }, pulled: [], payer: { BJs: 'mom' }, paid: { [paidKey('BJs', 'mom', 'sis')]: 1000 } };
    expect(monthOthersOwe(g, m)).toBe(0);
  });
});
