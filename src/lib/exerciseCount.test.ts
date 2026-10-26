import { describe, it, expect } from 'vitest';
import { BUILTIN } from './data.js';
import { exerciseCount } from './exerciseCount.js';
import { unitsOf } from './logic.js';

const one = { items: [{ ex: 'a' }] };
describe('exerciseCount', () => {
  it('counts a single card as one, a superset as its exercises and an either/or card as one', () => {
    expect(exerciseCount([one, one])).toBe(2);
    expect(exerciseCount([{ type: 'superset', items: [{}, {}] }])).toBe(2);
    expect(exerciseCount([{ type: 'superset', items: [{}, {}, {}] }])).toBe(3);
    expect(exerciseCount([{ type: 'either', items: [{}, {}] }])).toBe(1);
    expect(exerciseCount([one, { type: 'superset', items: [{}, {}] }, { type: 'either', items: [{}, {}] }, one])).toBe(5);
  });
  it('is zero for an empty day', () => { expect(exerciseCount([])).toBe(0); });
  it('agrees with the Board’s own count for every day of the built-in programs', () => {
    for (const k of ['A', 'B'] as const) for (const d of BUILTIN[k].days) {
      const cards = d.slots.map(s => ({ ...s, id: s.id || 'x' }));
      expect(exerciseCount(d.slots)).toBe(cards.reduce((n, s) => n + unitsOf(s as never), 0));
    }
  });
});
