import { describe, expect, it } from 'vitest';
import { addRecent, composeAmount, loadRecents, parseAmount, saveRecents, stepWhole } from './amountPicker.js';
import { scaleAmount } from './recipeScale.js';

const c = (whole: number, frac = '', unit = '') => composeAmount({ whole, frac, unit });

describe('composeAmount', () => {
  it.each([
    [1, '', 'cup', '1 cup'],
    [1, '½', 'cup', '1½ cups'],
    [0, '½', 'cup', '½ cup'],
    [2, '', 'cup', '2 cups'],
    [0, '½', 'tsp', '½ tsp'],
    [3, '', 'tbsp', '3 tbsp'],
    [2, '', 'clove', '2 cloves'],
    [1, '', 'clove', '1 clove'],
    [0, '', 'pinch', 'pinch'],
    [4, '', 'g', '4 g'],
    [0, '', '', ''],
    [2, '', '', '2'],
    [0, '¾', '', '¾'],
  ] as [number, string, string, string][])('%s %s %s -> %s', (whole, frac, unit, out) => expect(c(whole, frac, unit)).toBe(out));
});

describe('parseAmount', () => {
  it('opens an empty amount at 1', () => expect(parseAmount('')).toEqual({ parts: { whole: 1, frac: '', unit: '' }, exact: true }));
  it.each(['1 cup', '1½ cups', '½ tsp', '2 cloves', 'pinch', '3 tbsp', '2'])('%s is read exactly and written back unchanged', t => {
    const r = parseAmount(t);
    expect(r.exact).toBe(true);
    expect(composeAmount(r.parts)).toBe(t);
  });
  it.each(['to taste', '1 (14 oz) can', '2-3 cloves', '1 ½ cups', '1.5 cups', '1/2 cup', '100 g', '1 cups', '1 Cup', 'a handful'])('%s is kept as typed', t => {
    expect(parseAmount(t).exact).toBe(false);
  });
  it('still reads the number and unit out of text it keeps, so a chip tap starts from them', () => {
    expect(parseAmount('1 ½ cups').parts).toEqual({ whole: 1, frac: '½', unit: 'cup' });
    expect(parseAmount('to taste').parts).toEqual({ whole: 0, frac: '', unit: '' });
  });
  it('an amount written by the picker still scales', () => {
    expect(scaleAmount(c(1, '½', 'cup'), 2).text).toBe('3 cups');
    expect(scaleAmount(c(0, '½', 'tsp'), 2).text).toBe('1 tsp');
  });
});

describe('stepWhole', () => {
  it('stays from 0 to 99', () => {
    expect(stepWhole(0, -1)).toBe(0);
    expect(stepWhole(99, 1)).toBe(99);
    expect(stepWhole(3, 1)).toBe(4);
    expect(stepWhole(3, -1)).toBe(2);
  });
});

describe('recent amounts', () => {
  it('puts the newest first, one of each, at most four', () => {
    expect(addRecent(['1 cup', '2 tbsp'], '2 tbsp')).toEqual(['2 tbsp', '1 cup']);
    expect(addRecent(['a', 'b', 'c', 'd'], 'e')).toEqual(['e', 'a', 'b', 'c']);
    expect(addRecent(['a'], '  ')).toEqual(['a']);
  });
  it('a browser that blocks storage has none and does not throw', () => {
    expect(loadRecents()).toEqual([]);
    expect(() => saveRecents(['1 cup'])).not.toThrow();
  });
});
