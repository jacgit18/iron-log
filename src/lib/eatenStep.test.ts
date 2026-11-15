import { describe, expect, it } from 'vitest';
import type { DietEntry } from '../types.ts';
import { entryTotalsAt } from './portionBasis.js';
import { eatenAmount, eatenMax, loggedEntry, plannedEntryStep, plannedStep, rowStepper } from './eatenStep.js';

const entry = (o: Partial<DietEntry> = {}): DietEntry => ({ id: 'e1', d: '2026-11-15', n: 'Oats', kcal: 300, p: 10, ...o });
const oats = { cat: 'other' as const, kcal: 300, p: 10 };

describe('eatenAmount', () => {
  it('a food with a recipe reads in its own unit', () => {
    expect(eatenAmount(entry({ x: 1.5 }), oats)).toBe('1.5 portions');
    expect(eatenAmount(entry(), oats)).toBe('1 portion');
  });
  it('a food with no recipe behind it reads "x 1.5"', () => {
    expect(eatenAmount(entry({ x: 1.5 }))).toBe('x 1.5');
    expect(eatenAmount(entry())).toBe('x 1');
  });
});

describe('rowStepper', () => {
  it('offers both steps in the middle', () => {
    expect(rowStepper(entry({ x: 1.5, kcal: 450 }), oats)).toEqual({ text: '1.5 portions', less: 1, more: 2 });
  });
  it('Less has no step at half a portion', () => {
    expect(rowStepper(entry({ x: 0.5, kcal: 150 }), oats).less).toBeNull();
  });
  it('More has no step at the ceiling of 10 portions', () => {
    expect(rowStepper(entry({ x: 10, kcal: 3000 }), oats).more).toBeNull();
  });
  it('More stops where the totals stop fitting one entry (9,999 kcal)', () => {
    const r = rowStepper(entry({ x: 1, kcal: 6000, p: 10 }));
    expect(r.more).toBe(1.5); // 9,000 kcal still fits
    expect(rowStepper(entry({ x: 1.5, kcal: 9000 })).more).toBeNull(); // 12,000 does not
  });
  it('an entry with no recorded portion steps from 1', () => {
    expect(rowStepper(entry(), oats)).toMatchObject({ less: 0.5, more: 1.5 });
  });
  it('the limit is the recipe\'s own, never above the shared ceiling for More', () => {
    expect(eatenMax(undefined)).toBe(10);
    expect(eatenMax({ ...oats, usual: 20 })).toBeGreaterThanOrEqual(10);
    expect(rowStepper(entry({ x: 10, kcal: 3000 }), { ...oats, usual: 20 }).more).toBeNull();
  });
  it('Less then More lands within 1 kcal of the start (calories are stored whole, so never exact equality)', () => {
    const start = entry({ x: 1.5, kcal: 451 });
    const less = rowStepper(start).less!;
    const down = entryTotalsAt(start, less)!;
    const back = entryTotalsAt({ ...start, kcal: down.kcal, p: down.p, x: down.x }, rowStepper({ ...start, kcal: down.kcal, p: down.p, x: down.x }).more!)!;
    expect(less).toBe(1);
    expect(Math.abs(back.kcal - start.kcal)).toBeLessThanOrEqual(1);
  });
});

describe('loggedEntry', () => {
  const list = [entry({ id: 'a' }), entry({ id: 'b' })];
  it('is the one entry a ticked recipe card added', () => {
    expect(loggedEntry(['a'], list)?.id).toBe('a');
  });
  it('is nothing for an unticked card, a deleted entry, or several entries (a saved meal)', () => {
    expect(loggedEntry(undefined, list)).toBeUndefined();
    expect(loggedEntry(['zzz'], list)).toBeUndefined();
    expect(loggedEntry(['a', 'b'], list)).toBeUndefined();
  });
});

describe('plannedStep', () => {
  it('steps the plan portion by half, within 0.5 to 10', () => {
    expect(plannedStep(1, 1)).toBe(1.5);
    expect(plannedStep(1, -1)).toBe(0.5);
    expect(plannedStep(0.5, -1)).toBeNull();
    expect(plannedStep(10, 1)).toBeNull();
  });
});

describe('plannedEntryStep (a ticked card)', () => {
  it('steps the logged entry\'s own count and the plan follows on a half step', () => {
    expect(plannedEntryStep(entry({ x: 1, kcal: 300 }), 1)).toEqual({ count: 1.5, plan: 1.5 });
    expect(plannedEntryStep(entry({ x: 1, kcal: 300 }), -1)).toEqual({ count: 0.5, plan: 0.5 });
  });
  it('keeps an edit made to the entry: an entry edited to 3 portions steps to 3.5, whatever the plan said', () => {
    expect(plannedEntryStep(entry({ x: 3, kcal: 900 }), 1)).toEqual({ count: 3.5, plan: 3.5 });
  });
  it('an entry on a count the plan cannot hold leaves the plan alone', () => {
    expect(plannedEntryStep(entry({ x: 1.25, kcal: 375 }), 1)).toEqual({ count: 1.75, plan: null });
    expect(plannedEntryStep(entry({ x: 12, kcal: 3600 }), -1)).toEqual({ count: 11.5, plan: null });
  });
  it('has no step where the entry has none (half a portion, or totals that stop fitting)', () => {
    expect(plannedEntryStep(entry({ x: 0.5, kcal: 150 }), -1)).toBeNull();
    expect(plannedEntryStep(entry({ x: 1.5, kcal: 9000 }), 1)).toBeNull();
  });
});
