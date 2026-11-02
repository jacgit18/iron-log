import { describe, expect, it } from 'vitest';
import type { DietEntry } from '../types.ts';
import { MAX_DIET_PER_DAY } from '../shared/diet.js';
import { hourGap, planCopy, suggestNow } from './dietSuggest.js';

let n = 0;
const e = (d: string, name: string, t?: number, extra: Partial<DietEntry> = {}): DietEntry => ({ id: `e${++n}`, d, n: name, kcal: 300, p: 20, ...(t !== undefined ? { t } : {}), ...extra });
const today = '2026-10-30';
const names = (x: { n: string }[]) => x.map(f => f.n);

describe('hourGap', () => {
  it('wraps past midnight', () => { expect(hourGap(23, 1)).toBe(2); expect(hourGap(0, 12)).toBe(12); expect(hourGap(8, 8)).toBe(0); expect(hourGap(5, 20)).toBe(9); });
});

describe('suggestNow', () => {
  const log = [
    e('2026-10-27', 'Oats', 8), e('2026-10-28', 'Oats', 8), e('2026-10-29', 'Oats', 9),
    e('2026-10-27', 'Chicken and rice', 19), e('2026-10-28', 'Chicken and rice', 19), e('2026-10-29', 'Chicken and rice', 20), e('2026-10-29', 'Chicken and rice', 19),
  ];
  it('puts what you eat near this hour first', () => {
    expect(names(suggestNow(log, 8, today))[0]).toBe('Oats');
    expect(names(suggestNow(log, 19, today))[0]).toBe('Chicken and rice');
  });
  it('still lists a food from another hour, after the ones that match', () => {
    expect(names(suggestNow(log, 8, today))).toEqual(['Oats', 'Chicken and rice']);
  });
  it('counts across midnight', () => {
    const late = [e('2026-10-29', 'Shake', 23), e('2026-10-29', 'Toast', 12)];
    expect(names(suggestNow(late, 1, today))[0]).toBe('Shake');
  });
  it('ranks by recency when nothing has an hour', () => {
    const old = [e('2026-10-20', 'Eggs'), e('2026-10-28', 'Toast'), e('2026-10-25', 'Rice')];
    expect(names(suggestNow(old, 8, today))).toEqual(['Toast', 'Rice', 'Eggs']);
  });
  it('one entry per name, case-blind, with the numbers of the latest', () => {
    const l = [e('2026-10-20', 'Rice', 12, { kcal: 200 }), e('2026-10-28', 'rice', 12, { kcal: 260 })];
    const s = suggestNow(l, 12, today);
    expect(s).toHaveLength(1); expect(s[0]).toMatchObject({ n: 'rice', kcal: 260 });
  });
  it('keeps the recipe link, carbs and fat of the latest entry', () => {
    const s = suggestNow([e('2026-10-28', 'Chili', 18, { from: 'r1', c: 40, f: 10 })], 18, today);
    expect(s[0]).toEqual({ n: 'Chili', kcal: 300, p: 20, c: 40, f: 10, from: 'r1' });
  });
  it('ignores entries older than 60 days and entries after today', () => {
    const l = [e('2026-08-01', 'Ancient', 8), e('2026-11-02', 'Future', 8), e('2026-08-31', 'Edge', 8)];
    expect(names(suggestNow(l, 8, today))).toEqual(['Edge']);
  });
  it('is empty with no history and stops at the limit', () => {
    expect(suggestNow([], 8, today)).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => e('2026-10-28', `Food ${i}`, 8));
    expect(suggestNow(many, 8, today)).toHaveLength(6);
    expect(suggestNow(many, 8, today, 3)).toHaveLength(3);
  });
});

describe('planCopy', () => {
  const l = [e('2026-10-29', 'Oats'), e('2026-10-29', 'Chili', undefined, { from: 'r1' }), e('2026-10-29', 'Rice'), e('2026-10-30', 'Toast')];
  it('copies the whole day with numbers and recipe link, in order', () => {
    const r = planCopy(l, '2026-10-29', '2026-10-31', null);
    expect(names(r.add)).toEqual(['Oats', 'Chili', 'Rice']); expect(r.add[1]!.from).toBe('r1'); expect(r.left).toBe(0);
  });
  it('copies only the ticked ones', () => {
    const r = planCopy(l, '2026-10-29', '2026-10-31', new Set([l[0]!.id, l[2]!.id]));
    expect(names(r.add)).toEqual(['Oats', 'Rice']);
  });
  it('stops at the per-day limit and counts what was left out', () => {
    const full = Array.from({ length: MAX_DIET_PER_DAY - 1 }, (_, i) => e('2026-10-30', `F${i}`));
    const r = planCopy([...l.slice(0, 3), ...full], '2026-10-29', '2026-10-30', null);
    expect(r.add).toHaveLength(1); expect(r.left).toBe(2);
  });
  it('adds nothing from an empty day', () => { expect(planCopy(l, '2026-10-01', '2026-10-30', null)).toEqual({ add: [], left: 0 }); });
});
