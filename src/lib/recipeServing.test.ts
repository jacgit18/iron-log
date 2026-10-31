import { describe, expect, it } from 'vitest';
import { estimateServing, servingLine } from './recipeServing.js';

describe('estimateServing', () => {
  const rows = [{ n: 'flour', amt: '500 g' }, { n: 'butter', amt: '½ lb' }, { n: 'milk', amt: '2 cups' }, { n: 'salt', amt: 'pinch', skip: true }, { n: '', amt: '1 kg' }];
  it('adds the gram-readable ingredients and divides by Servings', () => {
    const e = estimateServing(rows, 4);
    expect(e.grams).toBe(Math.round((500 + 226.8) / 4));
    expect(e).toMatchObject({ counted: 2, total: 3, leftOut: ['milk'] });
    expect(e.note).toBe('Counted 2 of 3 ingredients. Left out: milk.');
  });
  it('treats a blank or zero Servings as 1', () => {
    expect(estimateServing([{ n: 'oats', amt: '80 g' }], 0).grams).toBe(80);
    expect(estimateServing([{ n: 'oats', amt: '80 g' }], NaN).grams).toBe(80);
  });
  it('says so, and fills nothing, when no ingredient is in grams, ounces or pounds', () => {
    expect(estimateServing([{ n: 'milk', amt: '2 cups' }, { n: 'eggs', amt: '3' }], 2)).toMatchObject({ grams: null, counted: 0, note: 'No ingredients are written in grams, ounces or pounds.' });
    expect(estimateServing([], 1).grams).toBeNull();
  });
  it('refuses a result outside 1 to 5000 grams', () => {
    expect(estimateServing([{ n: 'rice', amt: '20 kg' }], 1)).toMatchObject({ grams: null });
    expect(estimateServing([{ n: 'rice', amt: '20 kg' }], 1).note).toContain('outside 1 to 5,000 g');
    expect(estimateServing([{ n: 'saffron', amt: '1 g' }], 4).grams).toBeNull(); // 0.25 g rounds to 0
  });
  it('ignores a skipped ingredient and unnamed rows', () => expect(estimateServing([{ n: 'a', amt: '100 g', skip: true }, { n: 'b', amt: '100 g' }], 1)).toMatchObject({ counted: 1, total: 1 }));
});

describe('servingLine', () => {
  it('joins words and grams, or shows whichever is set', () => {
    expect(servingLine('1 cup', 250)).toBe('1 cup (250 g)');
    expect(servingLine('1 slice')).toBe('1 slice');
    expect(servingLine(undefined, 250)).toBe('250 g');
    expect(servingLine('  ', undefined)).toBe('');
    expect(servingLine()).toBe('');
  });
});
