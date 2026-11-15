import { describe, expect, it } from 'vitest';
import { recipeMicroRows } from './recipeMicroRows.js';

// Brief recipe-auto-nutrition, Done when 6: rows for a recipe or ready-made food with its own `micro`; a meal built from linked foods keeps today's bars.
const own = { ing: [{ n: 'Oats' }], micro: { manganese: 1.15, zinc: 2.2 } };

describe('recipeMicroRows', () => {
  it('gives one row per nutrient against a day, biggest first', () => {
    const rows = recipeMicroRows(own);
    expect(rows.map(r => r.key)).toEqual(['manganese', 'zinc']);
    expect(rows[0]).toMatchObject({ percent: 50, bar: 50, figure: '1.15 mg' });
    expect(rows[0]!.name).toBe('Manganese per serving: 1.15 mg, 50% of a day\'s recommended amount.');
  });
  it('caps the bar at full but not the words', () => {
    const [r] = recipeMicroRows({ ing: [], micro: { vitaminC: 180 } });
    expect(r).toMatchObject({ bar: 100, percent: 200 });
  });
  it('has no rows without micro', () => {
    expect(recipeMicroRows({ ing: [] })).toEqual([]);
  });
  it('has no rows for a meal rolled up from linked foods (it keeps the part bars), but does for one on its own numbers', () => {
    const meal = { ing: [{ n: 'Rice', rid: 'rice', q: 1 }], micro: { zinc: 2 } };
    expect(recipeMicroRows(meal)).toEqual([]);
    expect(recipeMicroRows({ ...meal, own: true as const })).toHaveLength(1);
  });
});
