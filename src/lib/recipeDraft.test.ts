import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../types.ts';
import { newRecipeId, recipeError, recipeFromCatalog } from './recipeDraft.js';

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
