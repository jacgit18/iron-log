import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../types.ts';
import type { Recipe } from '../types.ts';
import { attribution, newRecipeId, recipeError, recipeFromCatalog, withEditedMark } from './recipeDraft.js';

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
    expect(recipeError([], { n: 'x', ing: [], cat: 'ready' })).toBeNull(); // a ready-made food has no ingredients
    expect(recipeError([], { n: 'x', ing: [], cat: 'sides' })).toBe('Add at least one ingredient.');
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
  it('is not marked by a pin to an At home item alone, nor by clearing one', () => {
    expect(withEditedMark(lib, { ...lib, ing: [{ n: 'garlic', home: 'g1' }] })).not.toHaveProperty('edited');
    expect(withEditedMark({ ...lib, ing: [{ n: 'garlic', home: 'g1' }] }, { ...lib })).not.toHaveProperty('edited');
  });
  it('marks a copy whose servings and amounts were scaled', () => {
    const withAmt: Recipe = { ...lib, servings: 4, ing: [{ n: 'garlic', amt: '2 cloves' }] };
    expect(withEditedMark(withAmt, { ...withAmt, servings: 8, ing: [{ n: 'garlic', amt: '4 cloves' }] })).toHaveProperty('edited', true);
  });
  it('does not mark a new recipe', () => expect(withEditedMark(undefined, lib)).not.toHaveProperty('edited'));
});

describe('attribution', () => {
  it('credits the Wikibooks Cookbook on a library recipe and on a copy, and says Adapted once it is edited', () => {
    expect(attribution({ from: 'c:wbc:x' }, false)).toBe('From the Wikibooks Cookbook, CC BY-SA 4.0.');
    expect(attribution({ from: 'c:wbc:x' }, true)).toBe('From the Wikibooks Cookbook, CC BY-SA 4.0.');
    expect(attribution({ from: 'c:wbc:x', edited: true }, true)).toBe('Adapted from the Wikibooks Cookbook, CC BY-SA 4.0.');
  });
  it('credits nothing on a recipe you wrote', () => expect(attribution({}, true)).toBeNull());
});

describe('recipeFromCatalog at other servings', () => {
  const four: CatalogItem = { id: 'c:wbc:r9', name: 'Pancakes', data: { recipe: { cat: 'breakfast', ing: ['2 cups flour', 'pinch of salt'], steps: ['Mix.'], servings: 4 } } };
  it('copies the amounts and servings as scaled, and marks the copy edited', () => {
    expect(recipeFromCatalog(four, [], 8)).toMatchObject({ servings: 8, edited: true, ing: [{ n: 'flour', amt: '4 cups' }, { n: 'pinch of salt' }] });
  });
  it('copies as it is with the same servings, none given, or none in the recipe', () => {
    for (const sv of [undefined, 4]) expect(recipeFromCatalog(four, [], sv)).toMatchObject({ servings: 4, ing: [{ n: 'flour', amt: '2 cups' }, { n: 'pinch of salt' }] });
    expect(recipeFromCatalog(four, [], 4)).not.toHaveProperty('edited');
    const none = { ...four, data: { recipe: { ...four.data.recipe!, servings: undefined } } };
    expect(recipeFromCatalog(none, [], 8)).not.toHaveProperty('edited');
  });
});
