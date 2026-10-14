import { describe, expect, it } from 'vitest';
import { canonOf, stable } from './canon.js';

describe('canonOf', () => {
  it('stable JSON does not depend on key order', () => {
    expect(stable({ b: 1, a: { d: 2, c: 3 } })).toBe(stable({ a: { c: 3, d: 2 }, b: 1 }));
  });
  it('a grocery month is compared by its record, whatever order its lines were written in (ADR 039)', () => {
    const a = canonOf({ table: 'grocery_months', key: '2026-10', record: { lines: { kale: { got: true, qty: 2 } }, pulled: [] } });
    const b = canonOf({ table: 'grocery_months', key: '2026-10', record: { pulled: [], lines: { kale: { qty: 2, got: true } } } });
    expect(a).toBe(b);
    expect(canonOf({ table: 'grocery_months', key: '2026-10', record: { lines: {}, pulled: [] } })).not.toBe(a);
  });
  it('a grocery item row is compared with its position', () => {
    const item = { id: 'kale', n: 'Kale', store: '', qty: 1, cents: null, every: true, out: false };
    expect(canonOf({ table: 'list_items', key: 'grocery_item/kale', list: 'grocery_item', position: 0, item })).not.toBe(canonOf({ table: 'list_items', key: 'grocery_item/kale', list: 'grocery_item', position: 1, item }));
  });
});
