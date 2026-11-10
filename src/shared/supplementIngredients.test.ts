import { describe, expect, it } from 'vitest';
import { normConfig, normConfigDoc } from './config.js';
import { ingredientsOf, normSupplementItem } from './listItems.js';
import { CURATED_INGREDIENTS, MAX_INGREDIENT_ROWS, checkLimit, ingredientKey, ingredientLimitsOf, ingredientName } from './supplementIngredients.js';

// Brief supplement-active-ingredients: the rows a supplement keeps and the limits a person sets.
describe('ingredientName', () => {
  it('merges a typed name with a curated one, ignoring case and spacing', () => {
    expect(ingredientName('  omega-3 ')).toBe('Omega-3');
    expect(ingredientName('EPA')).toBe('EPA');
    expect(ingredientName('caffeine')).toBe('Caffeine');
    expect(CURATED_INGREDIENTS).toEqual(['Omega-3', 'EPA', 'DHA', 'Creatine', 'Caffeine']);
  });
  it('keeps a typed name as typed, tidied and cut to 60 characters', () => {
    expect(ingredientName('  L-Theanine   (Suntheanine) ')).toBe('L-Theanine (Suntheanine)');
    expect(ingredientName('x'.repeat(80))).toHaveLength(60);
    expect(ingredientName('   ')).toBe('');
    expect(ingredientKey(5)).toBe('');
  });
});

describe('ingredientsOf', () => {
  it('keeps good rows and rounds to three decimals', () => {
    expect(ingredientsOf([{ name: 'Omega-3', amount: 475.12345, unit: 'mg' }, { name: 'Ashwagandha', amount: 600, unit: 'mg' }])).toEqual([{ name: 'Omega-3', amount: 475.123, unit: 'mg' }, { name: 'Ashwagandha', amount: 600, unit: 'mg' }]);
  });
  it('drops a row with no name, a bad unit, or an amount that is not positive, not a number or too large', () => {
    const bad = [{ name: '', amount: 1, unit: 'mg' }, { name: 'A', amount: 1, unit: 'oz' }, { name: 'B', amount: 0, unit: 'mg' }, { name: 'C', amount: -1, unit: 'mg' }, { name: 'D', amount: '5', unit: 'mg' }, { name: 'E', amount: 1e8, unit: 'mg' }, { name: 'F', amount: NaN, unit: 'mg' }, null, 'x', { amount: 1, unit: 'mg' }];
    expect(ingredientsOf(bad)).toEqual([]);
    expect(ingredientsOf('nope')).toEqual([]);
  });
  it('keeps one row per name (any case) and unit, the first', () => {
    expect(ingredientsOf([{ name: 'EPA', amount: 1, unit: 'mg' }, { name: 'epa', amount: 2, unit: 'mg' }, { name: 'EPA', amount: 3, unit: 'g' }])).toEqual([{ name: 'EPA', amount: 1, unit: 'mg' }, { name: 'EPA', amount: 3, unit: 'g' }]);
  });
  it(`caps the rows at ${MAX_INGREDIENT_ROWS}`, () => {
    expect(ingredientsOf(Array.from({ length: 50 }, (_, i) => ({ name: `Thing ${i}`, amount: 1, unit: 'mg' })))).toHaveLength(MAX_INGREDIENT_ROWS);
  });
});

describe('a supplement with ingredients', () => {
  const base = { id: 'fish-oil', n: 'Fish oil', slot: 'morning' };
  it('keeps them beside the nutrient rows, and leaves the key out when there are none', () => {
    const x = normSupplementItem({ ...base, nutrients: [{ key: 'vitaminD', amount: 25, unit: 'mcg' }], ingredients: [{ name: 'DHA', amount: 150, unit: 'mg' }] })!;
    expect(x.nutrients).toEqual([{ key: 'vitaminD', amount: 25, unit: 'mcg' }]);
    expect(x.ingredients).toEqual([{ name: 'DHA', amount: 150, unit: 'mg' }]);
    expect('ingredients' in normSupplementItem({ ...base, ingredients: [{ name: '', amount: 1, unit: 'mg' }] })!).toBe(false);
    expect('ingredients' in normSupplementItem(base)!).toBe(false);
  });
});

describe('checkLimit', () => {
  it('accepts a target or a cap with a positive amount and a unit', () => {
    expect(checkLimit('cap', '400', 'mg')).toEqual({ limit: { kind: 'cap', amount: 400, unit: 'mg' } });
    expect(checkLimit('target', 5, 'g')).toEqual({ limit: { kind: 'target', amount: 5, unit: 'g' } });
  });
  it('refuses zero, a negative, text, too large, a missing kind or a bad unit', () => {
    ['0', '-5', 'abc', '', 0, -1, NaN].forEach(a => expect('error' in checkLimit('cap', a, 'mg')).toBe(true));
    expect('error' in checkLimit('cap', 0.0004, 'mg')).toBe(true); // rounds to zero
    expect(checkLimit('cap', 1e9, 'mg')).toEqual({ error: 'That amount is too large.' });
    expect('error' in checkLimit('soft', 5, 'mg')).toBe(true);
    expect('error' in checkLimit('cap', 5, 'oz')).toBe(true);
  });
});

describe('ingredientLimitsOf and the config', () => {
  it('keeps good limits by lowercase name and drops the rest', () => {
    expect(ingredientLimitsOf({ ' Caffeine ': { kind: 'cap', amount: 400, unit: 'mg' }, creatine: { kind: 'soft', amount: 5, unit: 'g' }, epa: { kind: 'target', amount: 0, unit: 'mg' }, dha: { kind: 'target', amount: 1, unit: 'oz' }, omega: 'x' })).toEqual({ caffeine: { kind: 'cap', amount: 400, unit: 'mg' } });
  });
  it('never takes a prototype key', () => {
    const raw = JSON.parse('{"__proto__":{"kind":"cap","amount":1,"unit":"mg"},"constructor":{"kind":"cap","amount":1,"unit":"mg"}}');
    expect(Object.keys(ingredientLimitsOf(raw))).toEqual([]);
  });
  it('normConfig keeps limits and drops the key when none is usable or it is not an object', () => {
    expect(normConfig({ ingredientLimits: { Caffeine: { kind: 'cap', amount: 400, unit: 'mg' } } }).ingredientLimits).toEqual({ caffeine: { kind: 'cap', amount: 400, unit: 'mg' } });
    expect('ingredientLimits' in normConfig({ ingredientLimits: { caffeine: { kind: 'cap', amount: -1, unit: 'mg' } } })).toBe(false);
    expect('ingredientLimits' in normConfig({ ingredientLimits: [1] })).toBe(false);
  });
  it('the stored config document keeps them too', () => {
    expect(normConfigDoc({ ingredientLimits: { creatine: { kind: 'target', amount: 5, unit: 'g' } } })?.ingredientLimits).toEqual({ creatine: { kind: 'target', amount: 5, unit: 'g' } });
  });
});
