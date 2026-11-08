import { describe, expect, it } from 'vitest';
import { DEFAULT_FOOD_TYPE, foodTypeOf, formFoodType, reviewChoices, suggestFoodType, untypedBanner, untypedFoods } from './foodType.js';
import type { Recipe } from '../types.ts';

const food = (id: string, n: string, extra: Partial<Recipe> = {}): Recipe => ({ id, n, cat: 'ready', ing: [], steps: [], kcal: 100, p: 5, ...extra });

describe('suggestFoodType', () => {
  it('suggests Drink for milk and kefir, Ingredient for eggs, Ready to eat for a frozen meal', () => {
    expect(suggestFoodType('Whole milk')).toBe('drink');
    expect(suggestFoodType('Goat milk kefir')).toBe('drink');
    expect(suggestFoodType('Eggs, large')).toBe('ingredient');
    expect(suggestFoodType('Frozen lasagna')).toBe('ready');
  });
  it('knows the other examples from the brief: juice, shake, flour, oats, rice, banana', () => {
    for (const n of ['Orange juice', 'Protein shake']) expect(suggestFoodType(n)).toBe('drink');
    for (const n of ['Flour', 'Rolled oats', 'Rice', 'Banana']) expect(suggestFoodType(n)).toBe('ingredient');
  });
  it('gives an unknown name Ready to eat, matches whole words only, and lets a drink word win', () => {
    expect(suggestFoodType('Xyzzy bar')).toBe('ready');
    expect(suggestFoodType('')).toBe('ready');
    expect(suggestFoodType('Boat snack')).toBe('ready'); // "oat" is not a word of it
    expect(suggestFoodType('Oat milk')).toBe('drink');
  });
});

describe('the form rule', () => {
  it('starts on Ready to eat and keeps a known choice', () => {
    expect(DEFAULT_FOOD_TYPE).toBe('ready');
    expect(formFoodType(undefined)).toBe('ready');
    expect(formFoodType('drink')).toBe('drink');
    expect(formFoodType('ingredient')).toBe('ingredient');
    expect(formFoodType('soup')).toBe('ready');
  });
});

describe('untyped foods', () => {
  const list = [food('a', 'Whole milk'), food('b', 'Egg', { type: 'ingredient' }), { id: 'c', n: 'Chili', cat: 'protein', ing: [], steps: [] } as Recipe];
  it('lists only ready-made foods with no type, and words the banner', () => {
    expect(untypedFoods(list).map(r => r.id)).toEqual(['a']);
    expect(untypedBanner(list)).toBe('1 food needs a type.');
    expect(untypedBanner([food('a', 'A'), food('b', 'B')])).toBe('2 foods need a type.');
    expect(untypedBanner([list[1]!, list[2]!])).toBeNull();
    expect(untypedBanner([])).toBeNull();
  });
  it('counts a food in the tabs by its type, an untyped one as Ready to eat, a drink recipe as Drink, other recipes as none', () => {
    expect(foodTypeOf(list[0]!)).toBe('ready');
    expect(foodTypeOf(list[1]!)).toBe('ingredient');
    expect(foodTypeOf({ ...list[2]!, cat: 'drinks' })).toBe('drink');
    expect(foodTypeOf(list[2]!)).toBeNull();
  });
  it('proposes the suggestion for each untyped food, with a changed row winning', () => {
    expect(reviewChoices(list)).toEqual({ a: 'drink' });
    expect(reviewChoices(list, { a: 'ready' })).toEqual({ a: 'ready' });
    expect(reviewChoices(list, { b: 'drink' })).toEqual({ a: 'drink' }); // a typed food is not part of the review
  });
});
