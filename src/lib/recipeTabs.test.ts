import { describe, expect, it } from 'vitest';
import type { Recipe } from '../types.ts';
import { emptyTabNote, filterRecipes, tabCounts, tabOf, typeTag } from './recipeList.js';

const r = (id: string, n: string, cat: Recipe['cat'], type?: Recipe['type']): Recipe => ({ id, n, cat, ...(type ? { type } : {}), ing: [{ n: 'rice' }], steps: ['Cook.'] });
const list = [
  r('egg', 'Eggs', 'ready', 'ingredient'), r('bar', 'Protein bar', 'ready', 'ready'), r('mlk', 'Oat milk', 'ready', 'drink'), r('old', 'Old food', 'ready'),
  r('soup', 'Lentil soup', 'protein'), r('lem', 'Lemonade', 'drinks'), r('cake', 'Cake', 'dessert'),
];
const ids = (tab: 'all' | 'foods' | 'meals' | 'drinks', q = '') => filterRecipes(list, { q, cat: null, canMake: false, tab }, new Set()).map(x => x.id).sort();

describe('type tabs', () => {
  it('puts ingredients and ready-to-eat foods (and an untyped food) under Foods', () => expect(ids('foods')).toEqual(['bar', 'egg', 'old']));
  it('puts a Drink food and a Drinks-category recipe under Drinks', () => expect(ids('drinks')).toEqual(['lem', 'mlk']));
  it('puts every other recipe under Meals', () => expect(ids('meals')).toEqual(['cake', 'soup']));
  it('shows everything under All, and no recipe is in two tabs or none', () => {
    expect(ids('all')).toHaveLength(list.length);
    expect([...ids('foods'), ...ids('meals'), ...ids('drinks')].sort()).toEqual(ids('all'));
  });
  it('searches inside a tab', () => { expect(ids('foods', 'milk')).toEqual([]); expect(ids('drinks', 'milk')).toEqual(['mlk']); });
  it('counts each tab over the list it is given', () => {
    expect(tabCounts(list)).toEqual({ all: 7, foods: 3, meals: 2, drinks: 2 });
    expect(tabCounts([])).toEqual({ all: 0, foods: 0, meals: 0, drinks: 0 });
  });
  it('tags a row with its type, or Meal', () => {
    expect(list.map(typeTag)).toEqual(['Ingredient', 'Ready to eat', 'Drink', 'Ready to eat', 'Meal', 'Drink', 'Meal']);
    expect(tabOf(list[0]!)).toBe('foods');
  });
  it('says what to do in an empty tab, and that a search found nothing', () => {
    expect(emptyTabNote('foods', false)).toContain('Scan a food');
    expect(emptyTabNote('meals', false)).toContain('Build a meal');
    expect(emptyTabNote('drinks', true)).toContain('Clear the search');
  });
});
