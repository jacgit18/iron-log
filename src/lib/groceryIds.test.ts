import { describe, expect, it } from 'vitest';
import { newGroceryId } from './grocery.js';

const item = (id: string, n: string, store = '') => ({ id, n, store, qty: 1, cents: 300, every: true, out: false });

describe('grocery ids (audit U-9, G-5)', () => {
  it('never makes an id that the page already uses for something else (groc-<id> against the fixed ids)', () => {
    ['Prev', 'Next', 'Month', 'Summary', 'Bought', 'Store milk', 'More cheese', 'Have it', 'H 0', 'View get'].forEach(n => {
      const id = newGroceryId([], n);
      expect(id, n).not.toMatch(/^(prev|next|month|summary|bought|store|more|have|h|view)(-|$)/);
    });
  });
  it('keeps a readable id for an ordinary name', () => {
    expect(newGroceryId([], 'Baby Spinach!')).toBe('baby-spinach');
    expect(newGroceryId([], '???')).toBe('item');
  });
  it('gives a second item with the same name a random suffix, so two offline devices do not make the same id', () => {
    const items = [item('kale', 'Kale', 'Aldi')];
    expect(newGroceryId(items, 'Kale')).toMatch(/^kale-[0-9a-f]{4}$/);
  });
  it('still avoids an id a month holds a line for', () => {
    const id = newGroceryId([], 'Kale', ['kale']);
    expect(id).not.toBe('kale');
  });
});
