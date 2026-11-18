import type { PlanItem, PlanSlot, Recipe, RecipeCategory, RecipeUse } from '../types.ts';
import { samePlanItem } from '../shared/diet.js';
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

/** The labels (`uses`) a form saves after the Beverage toggle: on, a Drink (alone, as the Used as chips do); off, the labels the food had before it was turned on (`before`, kept by the form) so Ingredient is not lost, else what the category gives (a Drinks-category food falls to Meal, so it stops being a drink). */
export function setBeverage(current: readonly RecipeUse[], cat: RecipeCategory, on: boolean, before?: readonly RecipeUse[]): RecipeUse[] {
  if (on) return ['drink'];
  if (!current.includes('drink')) return [...current];
  const kept = before?.filter(u => u !== 'drink');
  if (kept?.length) return [...kept];
  const base = defaultUsesFor(cat);
  return base.includes('drink') ? ['meal'] : base;
}

/** The meal an add stores on the item: the pressed meal, or nothing when the food has a usual meal and none was pressed, so the item follows the food (changing the usual meal later moves it); with no usual meal, the sheet's pick. */
export const storedMealFor = (recipe: Pick<Recipe, 'meal'> | undefined, picked: PlanSlot, explicit: boolean): PlanSlot | undefined => (explicit || !recipe?.meal ? picked : undefined);

/** The meal a recipe is planned into from the add sheet: the person's own pick when they pressed a meal (or opened the sheet from an empty meal's Add), else the recipe's usual meal, else the sheet's start pick (the clock's, or the last one used). */
export const planMealFor = (recipe: Pick<Recipe, 'meal'> | undefined, picked: PlanSlot, explicit: boolean): PlanSlot => (explicit ? picked : startMealFor(recipe, picked));

/** The line on a recipe or food card: "Usual meal: Breakfast", or null when it has none. */
export const usualMealLine = (recipe: Pick<Recipe, 'meal'>): string | null => (recipe.meal ? `Usual meal: ${recipe.meal[0]!.toUpperCase()}${recipe.meal.slice(1)}` : null);

/** The plan with every hand-placed copy of recipe `id` moved to `meal` on every day, so the food sits where its usual meal says (owner, 2026-11-18). Copies with no meal of their own already follow the recipe and are left alone. A copy is skipped when the day already holds the food in that meal (a day never holds it twice in one meal). Returns `plan` itself when nothing changed. */
export function followFoodMeal(plan: Record<string, PlanItem[]>, id: string, meal: PlanSlot): Record<string, PlanItem[]> {
  let next: Record<string, PlanItem[]> | null = null;
  for (const [day, items] of Object.entries(plan)) {
    let changed = false;
    const out = items.map(it => {
      if (it.k !== 'r' || it.id !== id || !it.s || it.s === meal) return it;
      const moved: PlanItem = { ...it, s: meal };
      if (items.some(x => x !== it && samePlanItem(x, moved)) ) return it;
      changed = true;
      return moved;
    });
    if (changed) { next ??= { ...plan }; next[day] = out; }
  }
  return next ?? plan;
}
