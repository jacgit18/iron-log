import { describe, expect, it } from 'vitest';
import type { DietEntry } from '../types.ts';
import { barPercent, entriesOn, hasMacros, meterText, oldestDay, pruned, recentQuick, roomOn, servingNumbers, shiftDay, totalsFor } from './dietLog.js';

const e = (id: string, d: string, n: string, kcal: number, p: number, from?: string): DietEntry => ({ id, d, n, kcal, p, ...(from ? { from } : {}) });
const list = [e('a', '2026-10-29', 'Rice', 200, 4), e('b', '2026-10-29', 'Chili', 600, 40.5, 'r1'), e('c', '2026-10-28', 'Eggs', 150, 12)];

describe('totals and days', () => {
  it('adds up one day only', () => {
    expect(totalsFor(list, '2026-10-29')).toEqual({ kcal: 800, protein: 44.5, count: 2 });
    expect(totalsFor(list, '2026-10-28')).toEqual({ kcal: 150, protein: 12, count: 1 });
    expect(totalsFor(list, '2026-10-27')).toEqual({ kcal: 0, protein: 0, count: 0 });
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

describe('pruned', () => {
  it('keeps 400 days', () => {
    const old = e('o', '2025-09-01', 'Old', 100, 1), edge = e('n', '2025-09-25', 'Edge', 100, 1);
    expect(pruned([old, edge, ...list], '2026-10-29').map(x => x.id)).toEqual(['n', 'a', 'b', 'c']);
  });
});

describe('recentQuick', () => {
  it('newest first, one per name, recipes left out', () => {
    const l = [e('1', '2026-10-27', 'Rice', 190, 4), e('2', '2026-10-28', 'rice', 200, 4), e('3', '2026-10-28', 'Chili', 600, 40, 'r1'), e('4', '2026-10-29', 'Toast', 90, 3)];
    expect(recentQuick(l)).toEqual([{ n: 'Toast', kcal: 90, p: 3 }, { n: 'rice', kcal: 200, p: 4 }]);
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
