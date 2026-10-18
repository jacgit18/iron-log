import { describe, it, expect } from 'vitest';
import { UNITS, normGrocery, unitWords } from './grocery.js';

describe('weighed items', () => {
  it('offers lb, kg and oz, and words the count and price by the unit', () => {
    expect([...UNITS]).toEqual(['kg', 'lb', 'oz']);
    expect(unitWords()).toMatchObject({ count: 'Count', price: 'Price each', per: '' });
    expect(unitWords().qty(3)).toBe('3');
    expect(unitWords('lb')).toMatchObject({ count: 'Weight (lb)', price: 'Price per lb', per: '/lb' });
    expect(unitWords('lb').qty(2.4)).toBe('2.4 lb');
  });
  it('keeps a known unit and leaves the key out for each, an unknown unit or none', () => {
    const c = normGrocery({ items: [{ id: 'a', n: 'A', unit: 'lb' }, { id: 'b', n: 'B', unit: 'stone' }, { id: 'c', n: 'C' }, { id: 'd', n: 'D', unit: 5 }] });
    expect(c.items[0].unit).toBe('lb');
    for (const i of c.items.slice(1)) expect('unit' in i).toBe(false);
  });
});
