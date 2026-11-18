import { describe, expect, it } from 'vitest';
import {
  cleanNutrition, countLines, estimateServings, ingredientHash, isCounted, isTrusted, passesShowRule, perServing, rescaleForServings, servedNutrition, servingsFor, sourceServings,
  totalGrams, type CountLine, type LibraryNutrition,
} from './libraryNutrition.js';

const m = (grams: number, extra: Partial<CountLine> = {}): CountLine => ({ status: 'matched', grams, gramsFrom: 'converted', confidence: 'low', ...extra });
const ING = ['1 cup rice', '2 eggs', 'salt to taste'];
const stored = (over: Partial<LibraryNutrition> = {}): LibraryNutrition => ({ kcal: 300, p: 12.5, c: 40, f: 9, micro: { iron: 2 }, servings: 4, of: 2, n: 2, hash: ingredientHash(ING), v: 1, ...over });

describe('servings', () => {
  it('trusts the source value, even 1, and never flags it', () => {
    expect(servingsFor(1, 500, 'protein')).toEqual({ servings: 1, estimated: false });
    expect(servingsFor(20, 100, 'protein')).toEqual({ servings: 20, estimated: false });
  });
  it('estimates and flags when the source has none, never silently 1', () => {
    expect(servingsFor(undefined, 1000, 'protein')).toEqual({ servings: 3, estimated: true });
    expect(servingsFor(undefined, 50, 'protein')).toEqual({ servings: 2, estimated: true }); // under the floor: stored as 2, still flagged
    expect(servingsFor(0, 1000, 'protein')?.estimated).toBe(true);
  });
  it('keeps an estimate between 2 and 24', () => {
    expect(estimateServings(100000, 'drinks')).toBe(24);
    expect(estimateServings(1, 'other')).toBe(2);
    expect(estimateServings(600, 'sauces')).toBe(10);
    expect(estimateServings(600, 'ready')).toBe(2); // a category with no portion uses the fallback
  });
  it('has no servings, and so no numbers, with neither a source value nor grams', () => {
    expect(servingsFor(undefined, 0, 'protein')).toBeUndefined();
    expect(estimateServings(Number.NaN, 'protein')).toBeUndefined();
  });
  it('reads a source value only when it is a whole number 1 to 99', () => {
    expect(['4', 0, 2.5, 100, undefined, null].map(sourceServings)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
    expect(sourceServings(99)).toBe(99);
  });
});

describe('counting and the show rule', () => {
  it('counts a matched line with grams; skip is in neither number', () => {
    expect(isCounted(m(50))).toBe(true);
    expect([{ status: 'none' }, { status: 'skip' }, m(0), { status: 'matched' }].map(l => isCounted(l as CountLine))).toEqual([false, false, false, false]);
    expect(countLines([m(10), m(10), { status: 'none' }, { status: 'skip' }])).toEqual({ of: 2, n: 3, trusted: false });
  });
  it('trusts grams read from the text or a confident match', () => {
    expect(isTrusted(m(5))).toBe(false);
    expect(isTrusted(m(5, { gramsFrom: 'text' }))).toBe(true);
    expect(isTrusted(m(5, { confidence: 'high' }))).toBe(true);
    expect(isTrusted({ status: 'none', gramsFrom: 'text' })).toBe(false);
  });
  it('serves at half and above, hides below', () => {
    const lines = (counted: number, total: number, extra: Partial<CountLine> = {}) => [...Array(counted).fill(m(10, extra)), ...Array(total - counted).fill({ status: 'none' })] as CountLine[];
    expect(passesShowRule(countLines(lines(4, 8, { confidence: 'high' })))).toBe(true);
    expect(passesShowRule(countLines(lines(3, 8, { confidence: 'high' })))).toBe(false);
    expect(passesShowRule(countLines(lines(7, 8, { confidence: 'high' })))).toBe(true);
  });
  it('hides when no counted line has trustworthy grams, or nothing could count', () => {
    expect(passesShowRule(countLines([m(10), m(10)]))).toBe(false);
    expect(passesShowRule(countLines([{ status: 'skip' }]))).toBe(false);
    expect(passesShowRule(countLines([]))).toBe(false);
  });
  it('adds the grams of the counted lines only', () => {
    expect(totalGrams([m(100), m(50.5), { status: 'none', grams: 900 }, { status: 'skip' }])).toBe(150.5);
  });
});

describe('ingredientHash', () => {
  it('is stable, ignores outer spaces, and changes with any line or their order', () => {
    expect(ingredientHash(ING)).toBe(ingredientHash(ING.map(l => ` ${l} `)));
    expect(ingredientHash(ING)).toMatch(/^[0-9a-f]{14}$/);
    expect(ingredientHash(ING)).not.toBe(ingredientHash(['2 cups rice', ...ING.slice(1)]));
    expect(ingredientHash(ING)).not.toBe(ingredientHash([...ING].reverse()));
    expect(ingredientHash(['a', 'b'])).not.toBe(ingredientHash(['ab']));
  });
});

describe('perServing', () => {
  it('divides the totals by the servings', () => {
    expect(perServing({ kcal: 1000, p: 50, c: 100.5, f: 20, micro: { iron: 8 } }, 4)).toEqual({ kcal: 250, p: 12.5, c: 25.1, f: 5, micro: { iron: 2 } });
    expect(perServing({ kcal: 1, p: 1, c: 1, f: 1 }, 0)).toBeNull();
    expect(perServing({ kcal: Number.NaN, p: 1, c: 1, f: 1 }, 2)).toBeNull();
  });
});

describe('serving the stored record', () => {
  it('serves numbers, the servings they are per and the count, with the servings flag when estimated', () => {
    expect(servedNutrition(stored(), ING)).toEqual({ kcal: 300, p: 12.5, c: 40, f: 9, micro: { iron: 2 }, servings: 4, est: { of: 2, n: 2 } });
    expect(servedNutrition(stored({ sEst: true, of: 7, n: 8 }), ING)?.est).toEqual({ of: 7, n: 8, sEst: true });
  });
  it('serves nothing when the ingredient text changed since the batch', () => {
    expect(servedNutrition(stored(), ['1 cup rice', '3 eggs', 'salt to taste'])).toBeNull();
  });
  it('serves nothing under the half floor, or for a malformed or missing record', () => {
    expect(servedNutrition(stored({ of: 3, n: 8 }), ING)).toBeNull();
    expect(servedNutrition(stored({ of: 0 }), ING)).toBeNull();
    expect(servedNutrition(stored({ servings: 0 }), ING)).toBeNull();
    expect(servedNutrition({ ...stored(), kcal: 'x' }, ING)).toBeNull();
    expect(servedNutrition(null, ING)).toBeNull();
    expect(servedNutrition([], ING)).toBeNull();
  });
  it('drops a micro that is not clean and keeps the rest', () => {
    expect(servedNutrition({ ...stored(), micro: { iron: -1, bogus: 3 } }, ING)).toEqual({ kcal: 300, p: 12.5, c: 40, f: 9, servings: 4, est: { of: 2, n: 2 } });
    expect(cleanNutrition(stored(), ING)?.v).toBe(1);
  });
});

describe('rescaleForServings', () => {
  it('multiplies per-serving numbers by old over new', () => {
    expect(rescaleForServings({ kcal: 300, p: 12, c: 40, f: 9, micro: { iron: 2 } }, 4, 2)).toEqual({ kcal: 600, p: 24, c: 80, f: 18, micro: { iron: 4 } });
    expect(rescaleForServings({ kcal: 300, p: 12 }, 4, 8)).toEqual({ kcal: 150, p: 6 });
  });
  it('leaves absent numbers absent and refuses an unusable servings value', () => {
    expect(rescaleForServings({}, 4, 2)).toEqual({});
    expect(rescaleForServings({ kcal: 100 }, 0, 2)).toBeNull();
    expect(rescaleForServings({ kcal: 100 }, 2, 0)).toBeNull();
  });
});
