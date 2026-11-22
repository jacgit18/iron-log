import { describe, expect, it } from 'vitest';
import type { PlanItem, Recipe, RepeatItem } from '../types.ts';
import { PLANNED_DAYS, plannedIndex, plannedPill, plannedWhen, spotText, type PlanSource } from './plannedOnBoard.js';

// 2026-11-18 is a Wednesday.
const T = '2026-11-18';
const rec = (id: string, meal?: Recipe['meal']): Pick<Recipe, 'id' | 'meal'> => ({ id, ...(meal ? { meal } : {}) });
const rs = [rec('oats', 'breakfast'), rec('rice'), rec('soup', 'lunch')];
const idx = (diet: PlanSource, entries: { id: string }[] = []) => plannedIndex(diet, entries, rs, T);
const planned = (id: string, extra: Partial<PlanItem> = {}): PlanItem => ({ k: 'r', id, p: true, ...extra });

describe('plannedIndex: what the board has planned in the next 7 days', () => {
  it('an item marked planned shows where it is: the day and the meal it follows', () => {
    const i = idx({ plan: { '2026-11-19': [planned('soup')] } });
    expect(plannedWhen(i, 'soup')).toEqual([{ day: '2026-11-19', slot: 'lunch' }]);
  });
  it('an item\'s own meal beats the food\'s usual meal; an item with neither names no meal', () => {
    const i = idx({ plan: { [T]: [planned('soup', { s: 'dinner' }), planned('rice')] } });
    expect(plannedWhen(i, 'soup')).toEqual([{ day: T, slot: 'dinner' }]);
    expect(plannedWhen(i, 'rice')).toEqual([{ day: T }]);
  });
  it('an unplanned item (Available) is not planned', () => {
    expect(plannedWhen(idx({ plan: { [T]: [{ k: 'r', id: 'oats' }] } }), 'oats')).toEqual([]);
  });
  it('the window is today and the six days after it: yesterday and the eighth day are out', () => {
    const last = '2026-11-24', after = '2026-11-25', before = '2026-11-17';
    expect(PLANNED_DAYS).toBe(7);
    const i = idx({ plan: { [before]: [planned('oats')], [T]: [planned('rice')], [last]: [planned('soup')], [after]: [planned('oats')] } });
    expect(plannedWhen(i, 'oats')).toEqual([]);
    expect(plannedWhen(i, 'rice')).toHaveLength(1);
    expect(plannedWhen(i, 'soup')).toHaveLength(1);
  });
  it('an eaten item does not count, an eaten mark whose entry is gone does', () => {
    const diet: PlanSource = { plan: { [T]: [planned('oats', { e: ['e1'] }), planned('rice', { e: ['gone'] })] } };
    const i = idx(diet, [{ id: 'e1' }]);
    expect(plannedWhen(i, 'oats')).toEqual([]);
    expect(plannedWhen(i, 'rice')).toHaveLength(1);
  });
  it('a saved meal counts as the recipe it became; one still held back is no food here', () => {
    const diet: PlanSource = { moved: { m1: 'soup' }, plan: { [T]: [{ k: 'm', id: 'm1', p: true, s: 'lunch' }, { k: 'm', id: 'held', p: true }] } };
    const i = idx(diet);
    expect(plannedWhen(i, 'soup')).toEqual([{ day: T, slot: 'lunch' }]);
    expect([...i.keys()]).toEqual(['soup']);
    expect(plannedWhen(idx({ moved: { m1: 'soup' }, plan: { [T]: [{ k: 'm', id: 'm1', p: true }] } }), 'soup')).toEqual([{ day: T, slot: 'lunch' }]); // no meal of its own: the recipe's usual meal
  });
  it('a planned repeat marks each day it shows in the window; an unplanned or handy repeat does not', () => {
    const base = { k: 'r' as const, from: '2026-11-01' };
    const repeats: RepeatItem[] = [
      { ...base, rid: 'rp1', id: 'oats', days: [1, 3], p: true }, // Mon and Wed
      { ...base, rid: 'rp2', id: 'rice', days: [1, 3] },
      { ...base, rid: 'rp3', id: 'soup', days: [0, 1, 2, 3, 4, 5, 6], h: true },
    ];
    const i = idx({ repeats });
    expect(plannedWhen(i, 'oats').map(s => s.day)).toEqual([T, '2026-11-23']);
    expect(plannedWhen(i, 'rice')).toEqual([]);
    expect(plannedWhen(i, 'soup')).toEqual([]);
  });
  it('a day skipped for a repeat, and a day the repeat has not started on, do not count', () => {
    const repeats: RepeatItem[] = [{ k: 'r', rid: 'rp1', id: 'oats', days: [1, 3], from: '2026-11-20', p: true }];
    expect(plannedWhen(idx({ repeats }), 'oats').map(s => s.day)).toEqual(['2026-11-23']);
    expect(plannedWhen(idx({ repeats, repeatSkips: { '2026-11-23': ['rp1'] } }), 'oats')).toEqual([]);
  });
  it('a stored copy of a repeat is one spot, not two', () => {
    const repeats: RepeatItem[] = [{ k: 'r', rid: 'rp1', id: 'oats', days: [3], from: '2026-11-01', p: true }];
    const i = idx({ repeats, plan: { [T]: [planned('oats')] } });
    expect(plannedWhen(i, 'oats')).toEqual([{ day: T, slot: 'breakfast' }]);
  });
  it('a repeat on a day already holding 8 planned things shows as Available there, so it does not count', () => {
    const eight = Array.from({ length: 8 }, (_, n) => planned(`x${n}`));
    const repeats: RepeatItem[] = [{ k: 'r', rid: 'rp1', id: 'oats', days: [3], from: '2026-11-01', p: true }];
    expect(plannedWhen(idx({ repeats, plan: { [T]: eight } }), 'oats')).toEqual([]);
  });
  it('the same food in two meals on one day is two spots, ordered by day then meal', () => {
    const i = idx({ plan: { '2026-11-19': [planned('rice', { s: 'dinner' }), planned('rice', { s: 'lunch' })], [T]: [planned('rice', { s: 'snack' })] } });
    expect(plannedWhen(i, 'rice').map(spotText)).toEqual(['Wed snack', 'Thu lunch', 'Thu dinner']);
  });
  it('an empty plan means nothing planned', () => {
    expect(plannedIndex({}, [], rs, T).size).toBe(0);
  });
});

describe('plannedPill: the row text', () => {
  it('says nothing when nothing is planned', () => expect(plannedPill([])).toBeNull());
  it('names the day and meal for one spot, and the day alone when no meal is named', () => {
    expect(plannedPill([{ day: '2026-11-19', slot: 'lunch' }])).toBe('Planned · Thu lunch');
    expect(plannedPill([{ day: '2026-11-19' }])).toBe('Planned · Thu');
  });
  it('one day with two meals lists the meals; several days count them', () => {
    expect(plannedPill([{ day: '2026-11-19', slot: 'lunch' }, { day: '2026-11-19', slot: 'dinner' }])).toBe('Planned · Thu lunch, dinner');
    expect(plannedPill([{ day: T, slot: 'lunch' }, { day: '2026-11-19', slot: 'lunch' }, { day: '2026-11-19', slot: 'dinner' }])).toBe('Planned · 2 days');
  });
});
