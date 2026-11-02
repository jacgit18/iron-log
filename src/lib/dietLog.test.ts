import { describe, expect, it } from 'vitest';
import type { DietEntry } from '../types.ts';
import { ateDayError, barPercent, entriesOn, entryText, hasMacros, meterText, missingCarbsFat, oldestDay, pruned, roomOn, servingNumbers, shiftDay, totalsFor } from './dietLog.js';

const e = (id: string, d: string, n: string, kcal: number, p: number, from?: string, cf?: [number, number]): DietEntry => ({ id, d, n, kcal, p, ...(cf ? { c: cf[0], f: cf[1] } : {}), ...(from ? { from } : {}) });
const list = [e('a', '2026-10-29', 'Rice', 200, 4), e('b', '2026-10-29', 'Chili', 600, 40.5, 'r1'), e('c', '2026-10-28', 'Eggs', 150, 12)];

describe('entriesOn order', () => {
  const at = (id: string, t?: number): DietEntry => ({ ...e(id, '2026-10-29', id, 100, 1), ...(t !== undefined ? { t } : {}) });
  it('orders by hour added, then insertion order', () => {
    expect(entriesOn([at('lunch2', 12), at('dinner', 18), at('breakfast', 8), at('lunch1', 12)], '2026-10-29').map(x => x.id)).toEqual(['breakfast', 'lunch2', 'lunch1', 'dinner']);
  });
  it('puts entries with no hour after the timed ones, in insertion order', () => {
    expect(entriesOn([at('old1'), at('late', 20), at('old2'), at('early', 7)], '2026-10-29').map(x => x.id)).toEqual(['early', 'late', 'old1', 'old2']);
  });
  it('does not reorder the input', () => {
    const input = [at('b', 9), at('a', 8)];
    entriesOn(input, '2026-10-29');
    expect(input.map(x => x.id)).toEqual(['b', 'a']);
  });
});

describe('totals and days', () => {
  it('adds up one day only', () => {
    expect(totalsFor(list, '2026-10-29')).toEqual({ kcal: 800, protein: 44.5, carbs: 0, fat: 0, count: 2 });
    expect(totalsFor(list, '2026-10-28')).toEqual({ kcal: 150, protein: 12, carbs: 0, fat: 0, count: 1 });
    expect(totalsFor(list, '2026-10-27')).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0, count: 0 });
    expect(entriesOn(list, '2026-10-28')).toHaveLength(1);
  });
  it('shifts across month and year ends', () => {
    expect(shiftDay('2026-10-29', -1)).toBe('2026-10-28');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('stops at 20 entries a day', () => {
    const full = Array.from({ length: 20 }, (_, i) => e(`x${i}`, '2026-10-29', 'Snack', 100, 1));
    expect(roomOn(full, '2026-10-29')).toBe(false);
    expect(roomOn(full, '2026-10-28')).toBe(true);
  });
});

describe('carbs and fat', () => {
  const l = [e('a', '2026-10-29', 'Rice', 200, 4, undefined, [44.5, 0.5]), e('b', '2026-10-29', 'Toast', 90, 3), e('c', '2026-10-29', 'Egg', 70, 6, undefined, [0.5, 5])];
  it('adds up what was entered and counts the rest as 0', () => {
    expect(totalsFor(l, '2026-10-29')).toMatchObject({ carbs: 45, fat: 5.5 });
  });
  it('says when an entry of the day has no carbs or fat', () => {
    expect(missingCarbsFat(l, '2026-10-29')).toBe(true);
    expect(missingCarbsFat([l[0]!, l[2]!], '2026-10-29')).toBe(false);
    expect(missingCarbsFat(l, '2026-10-28')).toBe(false);
  });
  it('words an entry, with carbs and fat only when entered', () => {
    expect(entryText({ kcal: 1520, p: 42 })).toBe('1,520 kcal · 42 g protein');
    expect(entryText({ kcal: 520, p: 42, c: 60, f: 12 })).toBe('520 kcal · 42 g protein · 60 g carbs · 12 g fat');
    expect(entryText({ kcal: 520, p: 42, f: 0 })).toBe('520 kcal · 42 g protein · 0 g fat');
  });
  it('a recipe serving brings its carbs and fat scaled', () => {
    expect(servingNumbers({ kcal: 600, p: 40, c: 51, f: 11 }, 1.5)).toEqual({ kcal: 900, p: 60, c: 76.5, f: 16.5 });
    expect(servingNumbers({ kcal: 600, p: 40 }, 2)).toEqual({ kcal: 1200, p: 80 });
  });
});

describe('pruned', () => {
  it('keeps 400 days', () => {
    const old = e('o', '2025-09-01', 'Old', 100, 1), edge = e('n', '2025-09-25', 'Edge', 100, 1);
    expect(pruned([old, edge, ...list], '2026-10-29').map(x => x.id)).toEqual(['n', 'a', 'b', 'c']);
  });
});

describe('servingNumbers', () => {
  it('scales a snapshot of the recipe numbers', () => {
    expect(servingNumbers({ kcal: 600, p: 40 }, 1)).toEqual({ kcal: 600, p: 40 });
    expect(servingNumbers({ kcal: 601, p: 35 }, 0.5)).toEqual({ kcal: 301, p: 17.5 });
  });
  it('needs both numbers and a sane result', () => {
    expect(hasMacros({ kcal: 600 })).toBe(false);
    expect(servingNumbers({ kcal: 600 }, 1)).toBeNull();
    expect(servingNumbers({ kcal: 9000, p: 10 }, 2)).toBeNull();
    expect(servingNumbers({ kcal: 600, p: 40 }, 0)).toBeNull();
  });
});

describe('meterText and oldestDay', () => {
  it('words the numbers, with the overshoot and with no target', () => {
    expect(meterText(1850, 2775, 'kcal')).toBe('1,850 of 2,775 kcal');
    expect(meterText(3000, 2775, 'kcal')).toBe('3,000 of 2,775 kcal, 225 over');
    expect(meterText(97, null, 'g')).toBe('97 g');
  });
  it('the oldest kept day is 400 days back', () => { expect(oldestDay('2026-10-29')).toBe('2025-09-24'); });
});

describe('barPercent', () => {
  it('stops at full and handles no target', () => {
    expect(barPercent(1850, 2775)).toBe(67);
    expect(barPercent(3000, 2775)).toBe(100);
    expect(barPercent(100, null)).toBe(0);
  });
});

describe('ateDayError', () => {
  const today = '2026-10-31';
  it('takes today and any earlier kept day', () => {
    expect(ateDayError('2026-10-31', today)).toBeNull();
    expect(ateDayError('2026-10-30', today)).toBeNull();
    expect(ateDayError(oldestDay(today), today)).toBeNull();
  });
  it('refuses a future day, one too far back, and anything that is not a real date', () => {
    expect(ateDayError('2026-11-01', today)).toBe('Pick today or an earlier day.');
    expect(ateDayError(shiftDay(oldestDay(today), -1), today)).toMatch(/too far back/);
    expect(ateDayError('', today)).toBe('Pick a day.');
    expect(ateDayError('2026-02-30', today)).toBe('Pick a day.');
  });
});
