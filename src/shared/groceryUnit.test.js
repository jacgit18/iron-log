import { describe, it, expect } from 'vitest';
import { validateSaveListItem } from './commands.js';

const kale = { id: 'kale', n: 'Kale', store: 'Veg market', qty: 2, cents: 250, every: false, out: true };
const save = item => validateSaveListItem({ list: 'grocery_item', position: 0, item });

describe('a grocery item sold by weight', () => {
  it('takes lb, kg and oz, and an item with no unit', () => {
    for (const unit of ['lb', 'kg', 'oz']) expect(save({ ...kale, unit }).item).toEqual({ ...kale, unit });
    expect('unit' in save(kale).item).toBe(false);
  });
  it('refuses a unit the app never sends', () => {
    for (const unit of ['stone', 'LB', '', 5, null, ' lb']) expect(save({ ...kale, unit })).toBeNull();
  });
});
