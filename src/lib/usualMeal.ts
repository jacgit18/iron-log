import type { PlanItem, PlanSlot, Recipe, RecipeCategory, RecipeUse } from '../types.ts';
import { defaultUsesFor } from './recipeUses.js';

/* ---------- A food's usual meal (brief nutrition-meal-labels-year-repeat): the meal a board item follows when the person has not put it in one. Pure; the board and the add sheet read it. ---------- */

type Foods = readonly Pick<Recipe, 'id' | 'meal'>[];

/** The usual meal of the recipe `id`, or undefined when it has none or is gone. */
export const usualMealOf = (id: string, recipes: Foods): PlanSlot | undefined => recipes.find(r => r.id === id)?.meal;

/** The meal an item sits in: its own (`s`, set by hand) wins; else, for a recipe, its usual meal; else none (the "Not set" group). A saved meal has no usual meal. */
export function mealOfItem(item: Pick<PlanItem, 'k' | 'id' | 's'>, recipes: Foods): PlanSlot | undefined {
  return item.s ?? (item.k === 'r' ? usualMealOf(item.id, recipes) : undefined);
}

/** Whether the item sits where it does because of its recipe's usual meal: no meal of its own, and the recipe has one. */
export const followsUsualMeal = (item: Pick<PlanItem, 'k' | 'id' | 's'>, recipes: Foods): boolean => !item.s && item.k === 'r' && usualMealOf(item.id, recipes) !== undefined;

/** The usual-meal choices a form offers, in the order of the day; `null` is "None" (the food has no usual meal). */
export const USUAL_MEAL_CHOICES: readonly { slot: PlanSlot | null; label: string }[] = [{ slot: 'breakfast', label: 'Breakfast' }, { slot: 'lunch', label: 'Lunch' }, { slot: 'dinner', label: 'Dinner' }, { slot: 'snack', label: 'Snack' }, { slot: null, label: 'None' }];

/** The meal the add sheet starts on for `recipe`: its usual meal, else `fallback` (the clock's pick). A saved meal, a food that is gone or one with no usual meal gives the fallback. */
export const startMealFor = (recipe: Pick<Recipe, 'meal'> | undefined, fallback: PlanSlot): PlanSlot => recipe?.meal ?? fallback;

/** The labels (`uses`) a form saves after the Beverage toggle: on, a Drink (alone); off, back to what the category gives (a Drinks-category food falls to Meal, so it stops being a drink). */
export function setBeverage(current: readonly RecipeUse[], cat: RecipeCategory, on: boolean): RecipeUse[] {
  if (on) return ['drink'];
  if (!current.includes('drink')) return [...current];
  const base = defaultUsesFor(cat);
  return base.includes('drink') ? ['meal'] : base;
}
