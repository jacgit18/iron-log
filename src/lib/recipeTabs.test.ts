import { describe, expect, it } from 'vitest';
import type { Recipe } from '../types.ts';
import { emptyTabNote, filterRecipes, tabCounts, tabOf, typeTag } from './recipeList.js';

const r = (id: string, n: string, cat: Recipe['cat'], type?: Recipe['type']): Recipe => ({ id, n, cat, ...(type ? { type } : {}), ing: [{ n: 'rice' }], steps: ['Cook.'] });
const list = [
  r('egg', 'Eggs', 'ready', 'ingredient'), r('bar', 'Protein bar', 'ready', 'ready'), r('mlk', 'Oat milk', 'ready', 'drink'), r('old', 'Old food', 'ready'),
  r('soup', 'Lentil soup', 'protein'), r('lem', 'Lemonade', 'drinks'), r('cake', 'Cake', 'dessert'),
];
const ids = (tab: 'all' | 'foods' | 'meals' | 'ingredients' | 'drinks', q = '') => filterRecipes(list, { q, cat: null, canMake: false, tab }, new Set()).map(x => x.id).sort();

describe('type tabs', () => {
  it('puts ready-to-eat foods (and an untyped food) under Foods; an ingredient-typed food is not one', () => expect(ids('foods')).toEqual(['bar', 'old']));
  it('puts an ingredient-typed food and a Protein recipe under Ingredients', () => expect(ids('ingredients')).toEqual(['egg', 'soup']));
  it('puts a Drink food and a Drinks-category recipe under Drinks', () => expect(ids('drinks')).toEqual(['lem', 'mlk']));
  it('puts every other recipe under Meals', () => expect(ids('meals')).toEqual(['cake', 'soup']));
  it('shows everything under All, and every recipe is in at least one tab (Protein is in two)', () => {
    expect(ids('all')).toHaveLength(list.length);
    expect([...new Set([...ids('foods'), ...ids('meals'), ...ids('ingredients'), ...ids('drinks')])].sort()).toEqual(ids('all'));
  });
  it('searches inside a tab', () => { expect(ids('foods', 'milk')).toEqual([]); expect(ids('drinks', 'milk')).toEqual(['mlk']); });
  it('counts each tab over the list it is given', () => {
    expect(tabCounts(list)).toEqual({ all: 7, foods: 2, meals: 2, ingredients: 2, drinks: 2 });
    expect(tabCounts([])).toEqual({ all: 0, foods: 0, meals: 0, ingredients: 0, drinks: 0 });
  });
  it('tags a row with what it is used as, or Meal', () => {
    expect(list.map(typeTag)).toEqual(['Ingredient', 'Ready to eat', 'Drink', 'Ready to eat', 'Meal + Ingredient', 'Drink', 'Meal']);
    expect(tabOf(list[0]!)).toBe('foods');
  });
  it('says what to do in an empty tab, and that a search found nothing', () => {
    expect(emptyTabNote('foods', false)).toContain('Scan a food');
    expect(emptyTabNote('meals', false)).toContain('Build a meal');
    expect(emptyTabNote('drinks', true)).toContain('Clear the search');
  });
});
