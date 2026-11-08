import { describe, expect, it } from 'vitest';
import { defaultUsesFor, hasUse, isEatable, toggleUse, usesOf, usesTag } from './recipeUses.js';
import { cleanUses, normRecipe, validRecipe } from '../shared/recipes.js';
import type { RecipeCategory } from '../types.ts';

describe('usesOf', () => {
  it('puts sauces and seasonings in Ingredient only, so they leave Meals', () => {
    for (const cat of ['sauces', 'seasonings'] as const) expect(usesOf({ cat })).toEqual(['ingredient']);
  });
  it('starts Protein, Carbs and Sides as Meal and Ingredient, a Drinks recipe as Drink, everything else as Meal', () => {
    for (const cat of ['protein', 'carbs', 'sides'] as const) expect(usesOf({ cat })).toEqual(['meal', 'ingredient']);
    expect(usesOf({ cat: 'drinks' })).toEqual(['drink']);
    for (const cat of ['breakfast', 'dessert', 'other'] as const) expect(usesOf({ cat })).toEqual(['meal']);
  });
  it('reads a ready-made food from its Type, an untyped one as Ready to eat', () => {
    expect(usesOf({ cat: 'ready', type: 'ingredient' })).toEqual(['ingredient']);
    expect(usesOf({ cat: 'ready', type: 'drink' })).toEqual(['drink']);
    expect(usesOf({ cat: 'ready' })).toEqual(['ready']);
  });
  it('lets saved labels win over the category and Type', () => {
    expect(usesOf({ cat: 'ready', type: 'ingredient', uses: ['ingredient', 'ready'] })).toEqual(['ingredient', 'ready']);
    expect(usesOf({ cat: 'sauces', uses: ['meal'] })).toEqual(['meal']);
  });
  it('ignores saved labels that are not usable', () => {
    expect(usesOf({ cat: 'sauces', uses: [] })).toEqual(['ingredient']);
    expect(usesOf({ cat: 'sauces', uses: ['soup'] as never })).toEqual(['ingredient']);
  });
  it('gives every category at least one label', () => {
    for (const cat of ['protein', 'carbs', 'sides', 'sauces', 'seasonings', 'drinks', 'breakfast', 'dessert', 'ready', 'other'] as RecipeCategory[]) expect(defaultUsesFor(cat).length).toBeGreaterThan(0);
  });
});

describe('isEatable, hasUse and usesTag', () => {
  it('shows Log for everything except an Ingredient-only recipe', () => {
    expect(isEatable({ cat: 'sauces' })).toBe(false);
    expect(isEatable({ cat: 'carbs' })).toBe(true);
    expect(isEatable({ cat: 'ready', uses: ['ingredient', 'ready'] })).toBe(true);
    expect(isEatable({ cat: 'drinks' })).toBe(true);
  });
  it('names the labels in words', () => {
    expect(usesTag({ cat: 'carbs' })).toBe('Meal + Ingredient');
    expect(usesTag({ cat: 'ready', uses: ['ingredient', 'ready'] })).toBe('Ingredient + Ready to eat');
    expect(hasUse({ cat: 'sauces' }, 'meal')).toBe(false);
  });
});

describe('toggleUse', () => {
  it('adds and removes a label but never leaves none', () => {
    expect(toggleUse(['meal'], 'ingredient')).toEqual(['meal', 'ingredient']);
    expect(toggleUse(['meal', 'ingredient'], 'meal')).toEqual(['ingredient']);
    expect(toggleUse(['ingredient'], 'ingredient')).toEqual(['ingredient']);
  });
  it('keeps Drink alone: choosing it drops the others, choosing another drops it', () => {
    expect(toggleUse(['meal', 'ingredient'], 'drink')).toEqual(['drink']);
    expect(toggleUse(['drink'], 'meal')).toEqual(['meal']);
  });
});

describe('cleanUses (the server cleaner)', () => {
  it('keeps known labels once, in order, and drops the rest', () => {
    expect(cleanUses(['ready', 'ingredient', 'ingredient', 'soup'])).toEqual(['ingredient', 'ready']);
  });
  it('returns nothing for a value that is not a list or holds no known label, and keeps a Drink alone', () => {
    expect(cleanUses('meal')).toBeNull();
    expect(cleanUses([])).toBeNull();
    expect(cleanUses(['x'])).toBeNull();
    expect(cleanUses(['meal', 'drink'])).toEqual(['drink']);
  });
});

describe('uses on a saved recipe (sync and restore)', () => {
  const base = { id: 'a', n: 'Egg', cat: 'ready', type: 'ready', ing: [], steps: [], kcal: 70, p: 6 };
  it('survives the server cleaner and is a valid recipe as written', () => {
    const r = normRecipe({ ...base, uses: ['ready', 'ingredient'] });
    expect(r?.uses).toEqual(['ingredient', 'ready']);
    expect(validRecipe({ ...base, uses: ['ingredient', 'ready'] })).toBe(true);
  });
  it('drops labels it does not know and leaves a recipe without them unchanged', () => {
    expect(normRecipe({ ...base, uses: ['soup'] })?.uses).toBeUndefined();
    expect(normRecipe(base)?.uses).toBeUndefined();
    expect(validRecipe({ ...base, uses: ['ready', 'ingredient'] })).toBe(false); // written out of order: the API refuses it, the app always writes the cleaned order
  });
});
