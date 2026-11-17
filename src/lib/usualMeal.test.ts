import { describe, expect, it } from 'vitest';
import type { PlanItem, Recipe } from '../types.ts';
import { USUAL_MEAL_CHOICES, followsUsualMeal, mealOfItem, setBeverage, startMealFor, usualMealOf } from './usualMeal.js';

const foods: Pick<Recipe, 'id' | 'meal'>[] = [{ id: 'oats', meal: 'breakfast' }, { id: 'rice' }, { id: 'tea', meal: 'snack' }];
const r = (id: string, s?: PlanItem['s']): PlanItem => ({ k: 'r', id, ...(s ? { s } : {}) });

describe('usualMealOf', () => {
  it('is the recipe\'s meal, or undefined for none or a recipe that is gone', () => {
    expect(usualMealOf('oats', foods)).toBe('breakfast');
    expect(usualMealOf('rice', foods)).toBeUndefined();
    expect(usualMealOf('gone', foods)).toBeUndefined();
  });
});

describe('mealOfItem', () => {
  it('an item with no meal of its own follows the usual meal', () => { expect(mealOfItem(r('oats'), foods)).toBe('breakfast'); });
  it('a hand-placed item keeps its own meal, whatever the usual one is', () => { expect(mealOfItem(r('oats', 'dinner'), foods)).toBe('dinner'); });
  it('a food with no usual meal stays unset (the Not set group)', () => { expect(mealOfItem(r('rice'), foods)).toBeUndefined(); });
  it('changing the usual meal moves every unplaced instance and no placed one', () => {
    const items = [r('oats'), r('oats', 'lunch'), r('oats')];
    const after = foods.map(f => (f.id === 'oats' ? { ...f, meal: 'snack' as const } : f));
    expect(items.map(i => mealOfItem(i, foods))).toEqual(['breakfast', 'lunch', 'breakfast']);
    expect(items.map(i => mealOfItem(i, after))).toEqual(['snack', 'lunch', 'snack']);
  });
  it('a saved meal has no usual meal, even when a recipe shares its id', () => { expect(mealOfItem({ k: 'm', id: 'oats' }, foods)).toBeUndefined(); });
});

describe('followsUsualMeal', () => {
  it('is true only for an unplaced recipe whose food has a usual meal', () => {
    expect(followsUsualMeal(r('oats'), foods)).toBe(true);
    expect(followsUsualMeal(r('oats', 'dinner'), foods)).toBe(false);
    expect(followsUsualMeal(r('rice'), foods)).toBe(false);
    expect(followsUsualMeal({ k: 'm', id: 'oats' }, foods)).toBe(false);
  });
});

describe('the form and the add sheet', () => {
  it('offers the four meals in day order, then None', () => {
    expect(USUAL_MEAL_CHOICES.map(c => c.slot)).toEqual(['breakfast', 'lunch', 'dinner', 'snack', null]);
  });
  it('starts the add sheet on the usual meal, else the fallback', () => {
    expect(startMealFor({ meal: 'dinner' }, 'snack')).toBe('dinner');
    expect(startMealFor({}, 'lunch')).toBe('lunch');
    expect(startMealFor(undefined, 'lunch')).toBe('lunch');
  });
  it('Beverage on is a Drink alone; off returns to the category default', () => {
    expect(setBeverage(['meal'], 'other', true)).toEqual(['drink']);
    expect(setBeverage(['drink'], 'protein', false)).toEqual(['meal', 'ingredient']);
    expect(setBeverage(['drink'], 'drinks', false)).toEqual(['meal']);
    expect(setBeverage(['meal'], 'other', false)).toEqual(['meal']);
  });
});
