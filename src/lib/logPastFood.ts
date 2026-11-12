import type { Recipe } from '../types.ts';
import { amountText } from './foodUnit.js';
import { ateDayError, entryFromFood, servingNumbers } from './dietLog.js';
import type { Food } from './foodMacros.js';
import type { Made, Ports } from './logOrPlan.js';

/* ---------- A food you logged before with no recipe behind it (brief nutrition-recipes-ownership-leftovers, 4c): it goes through the same portion sheet and LogControl as a recipe, log only. Pure: the store is passed in as `Ports`, the same slice `logOrPlan` takes. ---------- */

/** What the log control draws for a past food: its numbers as one serving, no id (there is no recipe to plan or to offer a pair for). */
export const pastFoodAsRecipe = (f: Food): Recipe => ({ id: '', n: f.n, kcal: f.kcal, p: f.p, ...(f.c !== undefined ? { c: f.c } : {}), ...(f.f !== undefined ? { f: f.f } : {}), ...(f.micro ? { micro: f.micro } : {}) }) as Recipe;

/** Log `servings` of a past food on `day` (today or earlier). Returns the sentence to show and an Undo that removes only that entry. A day ahead is refused: there is no recipe to plan. */
export function logPastFood(ports: Pick<Ports, 'addDietEntry' | 'removeDietEntry'>, food: Food, servings: number, day: string, today: string): Made {
  const nums = servingNumbers(food, servings);
  if (!nums) return { ok: false, error: 'Those numbers are out of range.' };
  const bad = day > today ? 'Only a food from your Recipes can be planned. Pick today or an earlier day.' : ateDayError(day, today);
  if (bad) return { ok: false, error: bad };
  const r = ports.addDietEntry(entryFromFood(day, { n: food.n, ...nums, ...(food.from ? { from: food.from } : {}) }));
  if (r.error || !r.id) return { ok: false, error: r.error ?? 'Couldn’t log that.' };
  const id = r.id;
  return { ok: true, text: `Logged ${food.n}: ${amountText(servings, pastFoodAsRecipe(food))} to ${day === today ? 'today' : day}.`, undo: () => ports.removeDietEntry(id, false) };
}
