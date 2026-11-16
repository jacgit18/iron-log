import { describe, expect, it } from 'vitest';
import type { LineMatch } from '../shared/ingredientMatch.js';
import type { Recipe } from '../types.ts';
import { applyFill, breakdownFor, canFill, countedLines, couldCount, failureText, fieldsOf, fillLines, forLines, mergeRetry, retryIndexes, fillNumbers, fillRows, fillWrites, hasNumbers, unsentCount, validServings, withFields } from './recipeFill.js';

const m = (line: string, grams: number, per100: LineMatch['per100'], over: Partial<LineMatch> = {}): LineMatch => ({ line, status: 'matched', fdcId: 1, food: line, grams, gramsFrom: 'text', confidence: 'high', per100, ...over });
const rice = m('200 g rice', 200, { id: 1, name: 'Rice', kcal: 130, p: 2.7, c: 28, f: 0.3, micro: { iron: 1, zinc: 1 } });
const oil = m('1 tbsp oil', 14, { id: 2, name: 'Oil', kcal: 884, p: 0, f: 100 }, { gramsFrom: 'converted', confidence: 'low' }); // lists no vitamins
const none: LineMatch = { line: 'dragon fruit', status: 'none' };
const retry: LineMatch = { line: 'saffron', status: 'none', retry: true };
const skip: LineMatch = { line: 'water', status: 'skip' };
const recipe = (o: Partial<Recipe> = {}): Recipe => ({ id: 'r', n: 'Rice', cat: 'protein', ing: [{ n: 'rice', amt: '200 g' }], steps: [], ...o });

describe('fillLines and canFill', () => {
  it('sends "amount name", leaves out skipped and empty lines, and stops at 40', () => {
    expect(fillLines(recipe({ ing: [{ n: 'rice', amt: '200 g' }, { n: 'salt', skip: true }, { n: '  ' }, { n: 'Olive oil' }] }))).toEqual(['200 g rice', 'Olive oil']);
    expect(fillLines(recipe({ ing: Array.from({ length: 45 }, (_, i) => ({ n: `food ${i}` })) }))).toHaveLength(40);
  });
  it('counts the lines past 40 as unsent, and the estimate counts them in M (review finding 4)', () => {
    const big = recipe({ ing: Array.from({ length: 45 }, (_, i) => ({ n: `food ${i}` })) });
    expect(unsentCount(big)).toBe(5);
    expect(unsentCount(recipe())).toBe(0);
    expect(fillNumbers([rice], new Set(), 1, 5)!.est).toEqual({ of: 1, n: 6 });
  });
  it('is offered for a recipe in Mine with ingredients that is not ready-made and not rolled up from linked foods', () => {
    expect(canFill(recipe(), true)).toBe(true);
    expect(canFill(recipe(), false)).toBe(false);
    expect(canFill(recipe({ cat: 'ready' }), true)).toBe(false);
    expect(canFill(recipe({ ing: [] }), true)).toBe(false);
    expect(canFill(recipe({ ing: [{ n: 'sauce', rid: 's', q: 1 }] }), true)).toBe(false);
    expect(canFill(recipe({ ing: [{ n: 'sauce', rid: 's', q: 1 }], own: true }), true)).toBe(true);
  });
});

describe('fillRows', () => {
  it('names each line Sure, Check, No match, retry or skip; a retry line is never No match', () => {
    expect(fillRows([rice, oil, none, retry, skip]).map(r => r.state)).toEqual(['sure', 'check', 'none', 'retry', 'skip']);
    expect(fillRows([rice])[0]).toMatchObject({ food: '200 g rice', grams: 200, gramsFrom: 'text', countable: true });
  });
  it('counts only matched lines with grams, minus the ones left out; skip lines are not in the second number', () => {
    const lines = [rice, oil, none, retry, skip];
    expect(countedLines(lines)).toEqual([0, 1]);
    expect(countedLines(lines, new Set([1]))).toEqual([0]);
    expect(couldCount(lines)).toBe(4);
  });
});

describe('fillNumbers', () => {
  it('sums calories and macros per serving, and saves a nutrient when at least one counted line lists it', () => {
    const f = fillNumbers([rice, oil], new Set(), 2)!;
    expect(f.kcal).toBe(Math.round((260 + 123.76) / 2));
    expect(f.p).toBe(2.7);
    expect(f.c).toBe(28);
    expect(f.f).toBe(7.3);
    expect(f.micro).toEqual({ iron: 1, zinc: 1 });
    expect(f.est).toEqual({ of: 2, n: 2 });
  });
  it('divides by the servings and leaves out c and f when no counted food lists them', () => {
    const f = fillNumbers([m('x', 100, { id: 3, name: 'X', kcal: 100, p: 10 })], new Set(), 4)!;
    expect(f).toEqual({ kcal: 25, p: 2.5, est: { of: 1, n: 1 } });
  });
  it('is null when nothing is counted, and with no usable servings', () => {
    expect(fillNumbers([none, skip], new Set(), 2)).toBeNull();
    expect(fillNumbers([rice], new Set([0]), 2)).toBeNull();
    expect(fillNumbers([rice], new Set(), 0)).toBeNull();
  });
  it('the est mark counts every line that could count, even the unmatched', () => {
    expect(fillNumbers([rice, none, retry, skip], new Set(), 1)!.est).toEqual({ of: 1, n: 3 });
  });
});

describe('breakdownFor', () => {
  it('flags "at least" when a counted food lists no vitamins', () => {
    const b = breakdownFor([rice, oil], new Set(), 2)!;
    expect(b.rows.map(r => r.key).sort()).toEqual(['iron', 'zinc']);
    expect(b.rows.every(r => r.atLeast)).toBe(true);
    expect(b.rows.find(r => r.key === 'iron')!.total).toBe(1) // 2 mg over 2 servings;
  });
  it('is null with nothing counted or no vitamins listed', () => {
    expect(breakdownFor([none], new Set(), 1)).toBeNull();
    expect(breakdownFor([oil], new Set(), 1)).toBeNull();
  });
});

describe('applyFill (Done when 4)', () => {
  const filled = fillNumbers([rice], new Set(), 1)!;
  it('hasNumbers is true for any typed number or vitamin', () => {
    expect(hasNumbers({})).toBe(false);
    expect(hasNumbers({ f: 0 })).toBe(true);
    expect(hasNumbers({ micro: { iron: 1 } })).toBe(true);
  });
  it('blanks never changes a typed number or an existing micro key, and adds what is missing', () => {
    const out = applyFill({ kcal: 500, p: 20, micro: { iron: 9 }, servings: 4 }, filled, 'blanks', 1);
    expect(out).toMatchObject({ kcal: 500, p: 20, c: 56, f: 0.6, servings: 4, est: filled.est });
    expect(out.micro).toEqual({ iron: 9, zinc: 2 });
  });
  it('replace takes every filled value and keeps a typed value the fill did not find (review finding 5)', () => {
    const out = applyFill({ kcal: 500, p: 20, micro: { calcium: 9 }, servings: 4 }, filled, 'replace', 1);
    expect(out).toMatchObject({ kcal: 260, p: 5.4, servings: 4 });
    expect(out.micro).toEqual({ calcium: 9, iron: 2, zinc: 2 });
    const noMacros = fillNumbers([m('x', 100, { id: 3, name: 'X', kcal: 100, p: 10 })], new Set(), 1)!; // lists no carbs or fat
    const kept = applyFill({ kcal: 500, p: 20, c: 60, f: 10 }, noMacros, 'replace', 1);
    expect(kept).toMatchObject({ kcal: 100, p: 10, c: 60, f: 10 });
  });
  it('with nothing typed both modes agree, and a recipe with no servings gets the typed value', () => {
    expect(applyFill({}, filled, 'blanks', 3)).toEqual(applyFill({}, filled, 'replace', 3));
    expect(applyFill({}, filled, 'blanks', 3).servings).toBe(3);
  });
  it('a fill that writes no value leaves the recipe as it was: no mark, no servings (review finding 3)', () => {
    const typed = { kcal: 500, p: 20, c: 60, f: 10, micro: { iron: 9, zinc: 3 } };
    const out = applyFill(typed, filled, 'blanks', 4);
    expect(out).toEqual(typed);
    expect(out.est).toBeUndefined();
    expect(fillWrites(typed, filled, 'blanks')).toBe(false);
    expect(fillWrites(typed, filled, 'replace')).toBe(true);
    expect(fillWrites({ ...typed, f: undefined } as never, filled, 'blanks')).toBe(true);
    const had = { ...typed, est: { of: 1, n: 2 } };
    expect(applyFill(had, filled, 'blanks', 4).est).toEqual({ of: 1, n: 2 }); // an earlier mark is not touched either
  });
  it('an existing zero is a typed number and kept', () => {
    expect(applyFill({ f: 0 }, filled, 'blanks', 1).f).toBe(0);
  });
});

describe('fieldsOf and withFields (Undo)', () => {
  it('puts the old fields back and removes the ones the fill added', () => {
    const before = recipe({ kcal: 100, servings: 2 });
    const after = withFields(before, applyFill(before, fillNumbers([rice], new Set(), 2)!, 'replace', 2));
    expect(after.micro).toBeDefined(); expect(after.est).toBeDefined();
    const back = withFields(after, fieldsOf(before));
    expect(back).toEqual(before);
  });
});

describe('retry and held answers (review findings 2 and 7)', () => {
  it('finds the retry lines and merges a second answer into only those positions', () => {
    const lines = [rice, none, retry, skip, retry];
    expect(retryIndexes(lines)).toEqual([2, 4]);
    const saffron = m('saffron', 1, { id: 9, name: 'Saffron', kcal: 310, p: 11 });
    const merged = mergeRetry(lines, [2, 4], [saffron, retry]);
    expect(merged[2]).toBe(saffron);
    expect(merged[4]).toBe(retry); // asked again, still not worked out: stays retry
    expect(merged[0]).toBe(rice); expect(merged[1]).toBe(none);
    expect(retryIndexes([rice, none, skip])).toEqual([]); // a plain none is not offered again
  });
  it('an answer or unticked set is used only for the lines it was made for', () => {
    expect(forLines({ sig: 'a\nb', v: 1 }, 'a\nb')).toBe(1);
    expect(forLines({ sig: 'a\nb', v: 1 }, 'a\nc')).toBeNull();
    expect(forLines(null, 'a')).toBeNull();
  });
});

describe('failureText (review finding 6)', () => {
  it('names the wait the server gave and never says 5 fills', () => {
    expect(failureText('cap', 10800)).toBe('Fill nutrition has reached its daily limit. Try again in about 3 hours.');
    expect(failureText('cap', 60)).toContain('about 1 minute.');
    expect(failureText('cap', 3601)).toContain('about 2 hours');
    expect(failureText('cap')).toContain('in a while');
    expect(failureText('cap', 99)).not.toMatch(/\b5\b/);
  });
});

describe('validServings', () => {
  it('is a whole number from 1 to 99', () => {
    expect([0, 1, 4, 99, 100, 2.5, NaN].map(validServings)).toEqual([false, true, true, true, false, false, false]);
  });
});
