import { describe, expect, it } from 'vitest';
import { MAX_DIET_PER_DAY } from '../shared/diet.js';
import type { DietEntry } from '../types.ts';
import { entryFromFood } from './dietLog.js';
import { instantLogText, runInstantLog, type AddEntry, type NewEntry } from './instantLog.js';
import { planCopy } from './dietSuggest.js';
import { planMeal } from './dietMeals.js';

const day = '2026-11-10';
const fullDay = (d: string, n = MAX_DIET_PER_DAY): DietEntry[] => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, d, n: `Food ${i}`, kcal: 100, p: 5 }));
const adder = (log: NewEntry[] = [], failAt = Infinity): AddEntry => e => {
  if (log.length >= failAt) return { id: null, error: 'That day is full.' };
  log.push(e);
  return { id: `n${log.length}`, error: null };
};

describe('instantLogText', () => {
  it('says how many were added, and from what', () => {
    expect(instantLogText(3)).toBe('Added 3.');
    expect(instantLogText(2, { from: 'Oats' })).toBe('Added 2 from Oats.');
  });
  it('names the day limit only for what the plan left out', () => {
    expect(instantLogText(18, { left: 4 })).toBe(`Added 18. 4 left out: ${MAX_DIET_PER_DAY} a day is the limit.`);
  });
  it('lets the store’s own words win over the day limit note', () => {
    expect(instantLogText(1, { error: 'Too far back.', left: 4 })).toBe('Added 1. Too far back.');
  });
});

describe('runInstantLog', () => {
  it('adds every entry in order and returns their ids', () => {
    const log: NewEntry[] = [];
    const out = runInstantLog(adder(log), [entryFromFood(day, { n: 'A', kcal: 1, p: 1 }), entryFromFood(day, { n: 'B', kcal: 2, p: 2 })]);
    expect(log.map(e => e.n)).toEqual(['A', 'B']);
    expect(out).toMatchObject({ done: 2, ids: ['n1', 'n2'], error: null, text: 'Added 2.' });
  });
  it('stops at the first refusal and says the store’s words', () => {
    const log: NewEntry[] = [];
    const entries = ['A', 'B', 'C'].map(n => entryFromFood(day, { n, kcal: 1, p: 1 }));
    const out = runInstantLog(adder(log, 1), entries, { from: 'Lunch' });
    expect(log).toHaveLength(1);
    expect(out).toMatchObject({ done: 1, ids: ['n1'], error: 'That day is full.', text: 'Added 1 from Lunch. That day is full.' });
  });
  it('treats an answer with no id and no text as a refusal, never as an add', () => {
    const out = runInstantLog(() => ({ id: null, error: null }), [entryFromFood(day, { n: 'A', kcal: 1, p: 1 })]);
    expect(out).toMatchObject({ done: 0, error: 'Couldn’t log that.' });
  });
  it('an empty plan adds nothing and still says so', () => {
    expect(runInstantLog(adder(), [], { left: 0 }).text).toBe('Added 0.');
  });
});

describe('one sentence from Copy day and Saved meals on a full day', () => {
  it('both say the same thing when the day has no room left', () => {
    const src = fullDay('2026-11-09');
    const target = fullDay(day);
    const copy = planCopy([...src, ...target], '2026-11-09', day, null);
    const meal = planMeal(target, day, { id: 'm', n: 'Meal', items: src.map(e => ({ n: e.n, kcal: e.kcal, p: e.p })) } as never);
    expect(copy.add).toHaveLength(0);
    expect(meal.add).toHaveLength(0);
    const a = runInstantLog(adder(), copy.add.map(f => entryFromFood(day, f)), { left: copy.left });
    const b = runInstantLog(adder(), meal.add.map(f => entryFromFood(day, f)), { left: meal.left });
    expect(a.text).toBe(`Added 0. ${MAX_DIET_PER_DAY} left out: ${MAX_DIET_PER_DAY} a day is the limit.`);
    expect(b.text).toBe(a.text);
  });
});
