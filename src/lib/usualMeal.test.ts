import { describe, expect, it } from 'vitest';
import type { PlanItem, Recipe } from '../types.ts';
import { USUAL_MEAL_CHOICES, followFoodMeal, followsUsualMeal, mealOfItem, planMealFor, setBeverage, startMealFor, storedMealFor, usualMealLine, usualMealOf } from './usualMeal.js';

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

describe('planMealFor', () => {
  it('uses the usual meal until the person picks a meal themselves', () => {
    expect(planMealFor({ meal: 'dinner' }, 'lunch', false)).toBe('dinner');
    expect(planMealFor({ meal: 'dinner' }, 'lunch', true)).toBe('lunch');
    expect(planMealFor({}, 'lunch', false)).toBe('lunch');
  });
});

describe('usualMealLine', () => {
  it('names the meal on the card, or is null', () => {
    expect(usualMealLine({ meal: 'breakfast' })).toBe('Usual meal: Breakfast');
    expect(usualMealLine({})).toBeNull();
  });
});

describe('Beverage off keeps the other labels, and an add follows the usual meal', () => {
  it('puts back the labels the food had before Beverage was turned on', () => {
    expect(setBeverage(['drink'], 'other', false, ['meal', 'ingredient'])).toEqual(['meal', 'ingredient']);
    expect(setBeverage(['drink'], 'other', false, ['drink'])).toEqual(['meal']); // nothing else to put back: the category's
  });
  it('stores no meal for a food with a usual meal unless one was pressed', () => {
    expect(storedMealFor({ meal: 'breakfast' }, 'lunch', false)).toBeUndefined();
    expect(storedMealFor({ meal: 'breakfast' }, 'lunch', true)).toBe('lunch');
    expect(storedMealFor({}, 'lunch', false)).toBe('lunch');
    expect(storedMealFor(undefined, 'lunch', false)).toBe('lunch');
  });
});

describe('followFoodMeal', () => {
  it('moves the hand-placed copies of that recipe to the meal on every day, and touches nothing else', () => {
    const plan = { '2026-11-18': [r('oats', 'lunch'), r('rice', 'dinner')], '2026-11-19': [r('oats', 'snack'), r('oats')], '2026-11-20': [r('rice')] };
    const next = followFoodMeal(plan, 'oats', 'breakfast');
    expect(next['2026-11-18']).toEqual([r('oats', 'breakfast'), r('rice', 'dinner')]);
    expect(next['2026-11-19']).toEqual([r('oats', 'breakfast'), r('oats')]);
    expect(next['2026-11-20']).toBe(plan['2026-11-20']);
  });
  it('skips a copy when the day already holds the food in that meal', () => {
    const plan = { d: [r('oats', 'breakfast'), r('oats', 'lunch')] };
    expect(followFoodMeal(plan, 'oats', 'breakfast')).toBe(plan);
  });
  it('returns the same plan when nothing changed', () => {
    const plan = { d: [r('oats')] };
    expect(followFoodMeal(plan, 'oats', 'breakfast')).toBe(plan);
  });
});
