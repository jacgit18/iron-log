import type { PlanItem, PlanSlot, Recipe } from '../types.ts';

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
