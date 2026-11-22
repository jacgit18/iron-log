import { describe, expect, it } from 'vitest';
import { stampMeal } from './stampMeal.js';

describe('stampMeal', () => {
  const made = () => { const seen: object[] = []; const ports = { tag: 'store', addDietEntry: (d: object) => { seen.push(d); return { id: 'x', error: null as string | null }; } }; return { ports, seen }; };
  it('puts the pressed meal on every entry the wrapped port is given, and keeps the rest of the port', () => {
    const { ports, seen } = made();
    const wrapped = stampMeal(ports, 'lunch');
    expect(wrapped.tag).toBe('store');
    expect(wrapped.addDietEntry({ d: '2026-11-15', n: 'Oats', kcal: 300, p: 10 })).toEqual({ id: 'x', error: null });
    expect(seen).toEqual([{ d: '2026-11-15', n: 'Oats', kcal: 300, p: 10, s: 'lunch' }]);
  });
  it('the pressed meal wins over an s the entry already carries', () => {
    const { ports, seen } = made();
    stampMeal(ports, 'snack').addDietEntry({ d: '2026-11-15', n: 'Oats', kcal: 300, p: 10, s: 'dinner' });
    expect(seen).toEqual([{ d: '2026-11-15', n: 'Oats', kcal: 300, p: 10, s: 'snack' }]);
  });
  it('with no meal it is the same port, so nothing is stamped', () => {
    const { ports, seen } = made();
    expect(stampMeal(ports, undefined)).toBe(ports);
    ports.addDietEntry({ d: '2026-11-15', n: 'Oats', kcal: 300, p: 10 });
    expect(seen).toEqual([{ d: '2026-11-15', n: 'Oats', kcal: 300, p: 10 }]);
  });
});
