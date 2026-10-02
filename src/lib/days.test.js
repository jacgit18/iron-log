import { describe, it, expect } from 'vitest';
import { DAY_COUNT, BUILTIN, hasValidDays, withAllDays, padLibrary, resolveProgram } from './data.js';

const six = () => ({ warm: 'w', days: Array.from({ length: 6 }, (_, i) => ({ title: `Day ${i + 1}`, slots: [] })) });

describe('seven days', () => {
  it('has seven days, and the built-in programs end with an empty Day 7', () => {
    expect(DAY_COUNT).toBe(7);
    ['A', 'B'].forEach(k => { expect(BUILTIN[k].days).toHaveLength(7); expect(BUILTIN[k].days[6]).toEqual({ title: 'Day 7', slots: [] }); });
  });
  it('accepts 6 or 7 days and nothing else', () => {
    expect(hasValidDays(six())).toBe(true);
    expect(hasValidDays(withAllDays(six()))).toBe(true);
    expect(hasValidDays({ days: six().days.slice(0, 5) })).toBe(false);
    expect(hasValidDays({ days: [...withAllDays(six()).days, { title: 'Day 8', slots: [] }] })).toBe(false);
    expect(hasValidDays(null)).toBe(false);
    expect(hasValidDays({})).toBe(false);
  });
  it('pads a 6-day program with an empty Day 7 without touching the original', () => {
    const p = six(); const q = withAllDays(p);
    expect(q.days).toHaveLength(7); expect(q.days[6]).toEqual({ title: 'Day 7', slots: [] }); expect(q.warm).toBe('w');
    expect(p.days).toHaveLength(6);
  });
  it('resolveProgram pads a saved 6-day program and falls back to the built-in for a bad one', () => {
    expect(resolveProgram('A', six()).days).toHaveLength(7);
    expect(resolveProgram('A', six()).key).toBe('A');
    expect(resolveProgram('A', { days: [] })).toBe(BUILTIN.A);
    expect(resolveProgram('B', null)).toBe(BUILTIN.B);
  });
  it('padLibrary pads each saved version and leaves a broken one alone', () => {
    const out = padLibrary([{ id: 'x', prog: six() }, { id: 'y', prog: { days: [] } }, null]);
    expect(out[0].prog.days).toHaveLength(7);
    expect(out[1].prog).toEqual({ days: [] });
    expect(out[2]).toBeNull();
  });
});
