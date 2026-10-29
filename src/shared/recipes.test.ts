import { describe, expect, it } from 'vitest';
import { MAX_INGREDIENTS, MAX_STEPS, normRecipe, normRecipes, validRecipe } from './recipes.js';

const base = { id: 'r1', n: 'Chili', cat: 'protein', ing: [{ n: 'Beans', amt: '2 cans' }], steps: ['Simmer.'] };

describe('normRecipe', () => {
  it('keeps a clean recipe as it is', () => {
    expect(normRecipe(base)).toEqual(base);
    expect(validRecipe(base)).toBe(true);
  });
  it('needs an id and a name', () => {
    expect(normRecipe({ ...base, id: '' })).toBeNull();
    expect(normRecipe({ ...base, n: '  ' })).toBeNull();
    expect(normRecipe({ ...base, id: 'constructor' })).toBeNull();
    expect(normRecipe('x')).toBeNull();
  });
  it('turns an unknown category into Other and drops blank lines', () => {
    const r = normRecipe({ ...base, cat: 'soup', ing: [{ n: ' ' }, { n: 'Salt' }, null], steps: ['', 'Stir.'] });
    expect(r).toMatchObject({ cat: 'other', ing: [{ n: 'Salt' }], steps: ['Stir.'] });
  });
  it('caps the lists and the number fields', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ n: `i${i}` }));
    const r = normRecipe({ ...base, ing: many, steps: many.map(m => m.n), servings: 0, minutes: 99999 })!;
    expect(r.ing).toHaveLength(MAX_INGREDIENTS);
    expect(r.steps).toHaveLength(MAX_STEPS);
    expect(r).not.toHaveProperty('servings');
    expect(r).not.toHaveProperty('minutes');
  });
  it('keeps from only when it is a catalog id', () => {
    expect(normRecipe({ ...base, from: 'c:wbc:chili' })).toHaveProperty('from', 'c:wbc:chili');
    expect(normRecipe({ ...base, from: 'evil' })).not.toHaveProperty('from');
  });
});

describe('validRecipe', () => {
  it('refuses what the app would never send', () => {
    expect(validRecipe({ ...base, cat: 'soup' })).toBe(false);
    expect(validRecipe({ ...base, extra: 1 })).toBe(false);
    expect(validRecipe({ ...base, n: ' Chili' })).toBe(false);
    expect(validRecipe(null)).toBe(false);
  });
});

describe('normRecipes', () => {
  it('drops what cannot be used and a repeated id, and tolerates a non-list', () => {
    expect(normRecipes([base, { ...base, n: 'Again' }, { id: 'x' }, null])).toEqual([base]);
    expect(normRecipes(undefined)).toEqual([]);
  });
});
