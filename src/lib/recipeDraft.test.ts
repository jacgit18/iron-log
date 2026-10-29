import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../types.ts';
import type { Recipe } from '../types.ts';
import { newRecipeId, recipeError, recipeFromCatalog, withEditedMark } from './recipeDraft.js';

const cat: CatalogItem = { id: 'c:wbc:recipe_00_001', name: 'Garlic Dressing', data: { recipe: { cat: 'sauces', ing: ['1 cup olive oil', '2 cloves garlic'], steps: ['Whisk.'], servings: 4 } } };

describe('newRecipeId', () => {
  it('uses the name and never repeats a used id', () => {
    const id = newRecipeId(['x'], 'Mom’s Chili!');
    expect(id).toMatch(/^mom-s-chili-[a-z0-9]{1,4}$/);
    expect(newRecipeId([], '   ')).toMatch(/^recipe-/);
  });
});

describe('recipeFromCatalog', () => {
  it('copies a catalog recipe, splitting amounts from names and remembering the source', () => {
    const r = recipeFromCatalog(cat, [])!;
    expect(r).toMatchObject({ n: 'Garlic Dressing', cat: 'sauces', ing: [{ n: 'olive oil', amt: '1 cup' }, { n: 'garlic', amt: '2 cloves' }], steps: ['Whisk.'], servings: 4, from: 'c:wbc:recipe_00_001' });
  });
  it('is null for a catalog row that is not a recipe', () => expect(recipeFromCatalog({ id: 'c:fedb:x', name: 'x', data: {} }, [])).toBeNull());
});

describe('recipeError', () => {
  it('needs a name and an ingredient, and stops at the cap', () => {
    expect(recipeError([], { n: ' ', ing: [{ n: 'a' }] })).toBe('Give the recipe a name.');
    expect(recipeError([], { n: 'x', ing: [{ n: ' ' }] })).toBe('Add at least one ingredient.');
    expect(recipeError([], { n: 'x', ing: [{ n: 'a' }] })).toBeNull();
    expect(recipeError(Array.from({ length: 300 }, () => ({}) as never), { n: 'x', ing: [{ n: 'a' }] })).toMatch(/up to 300/);
  });
});

describe('withEditedMark', () => {
  const lib: Recipe = { id: 'r1', n: 'Garlic dressing', cat: 'sauces', ing: [{ n: 'garlic' }], steps: ['Whisk.'], from: 'c:wbc:x' };
  it('leaves an untouched copy unmarked', () => expect(withEditedMark(lib, { ...lib })).not.toHaveProperty('edited'));
  it('marks a copy once an ingredient, a step or a swap changes', () => {
    expect(withEditedMark(lib, { ...lib, ing: [{ n: 'garlic', sub: 'shallot' }] })).toHaveProperty('edited', true);
    expect(withEditedMark(lib, { ...lib, ing: [{ n: 'garlic', skip: true }] })).toHaveProperty('edited', true);
    expect(withEditedMark(lib, { ...lib, steps: ['Whisk well.'] })).toHaveProperty('edited', true);
    expect(withEditedMark(lib, { ...lib, servings: 4 })).toHaveProperty('edited', true);
  });
  it('keeps the mark once set, even when saved with no further change', () => {
    const marked = { ...lib, edited: true as const };
    expect(withEditedMark(marked, { ...lib })).toHaveProperty('edited', true);
  });
  it('never marks a recipe you wrote', () => {
    const own: Recipe = { id: 'r2', n: 'Mine', cat: 'other', ing: [{ n: 'rice' }], steps: [] };
    expect(withEditedMark(own, { ...own, n: 'Mine, better' })).not.toHaveProperty('edited');
  });
  it('does not mark a copy the form hands back reshaped but unchanged', () => {
    const odd: Recipe = { ...lib, n: 'Garlic  dressing', steps: ['Whisk.\nServe.'] };
    expect(withEditedMark(odd, { ...odd, n: 'Garlic dressing', steps: ['Whisk.', 'Serve.'] })).not.toHaveProperty('edited');
  });
  it('does not mark a new recipe', () => expect(withEditedMark(undefined, lib)).not.toHaveProperty('edited'));
});
