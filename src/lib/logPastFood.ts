import type { Recipe } from '../types.ts';
import { amountText } from './foodUnit.js';
import { ateDayError, entryFromFood, servingNumbers } from './dietLog.js';
import type { Food } from './foodMacros.js';
import type { Made, Ports } from './logOrPlan.js';

/* ---------- A food you logged before with no recipe behind it (brief nutrition-recipes-ownership-leftovers, 4c): it goes through the same portion sheet and LogControl as a recipe, log only. Pure: the store is passed in as `Ports`, the same slice `logOrPlan` takes. ---------- */

/** The food a portion sheet was opened with (`modal.food`), or null when it is not one: a name and finite, non-negative calories and protein; carbs, fat and vitamins pass through only when they are numbers or an object. The modal is loosely typed, so this is the one place that checks it. */
export function pastFoodOf(x: unknown): Food | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (typeof o.n !== 'string' || o.n === '' || !num(o.kcal) || !num(o.p)) return null;
  return {
    n: o.n, kcal: o.kcal, p: o.p,
    ...(num(o.c) ? { c: o.c } : {}), ...(num(o.f) ? { f: o.f } : {}),
    ...(typeof o.from === 'string' && o.from !== '' ? { from: o.from } : {}),
    ...(typeof o.micro === 'object' && o.micro !== null ? { micro: o.micro as Food['micro'] } : {}),
  };
}

/** What the log control draws for a past food: its numbers as one serving, no id (there is no recipe to plan or to offer a pair for). */
export const pastFoodAsRecipe = (f: Food): Recipe => ({ id: '', n: f.n, kcal: f.kcal, p: f.p, ...(f.c !== undefined ? { c: f.c } : {}), ...(f.f !== undefined ? { f: f.f } : {}), ...(f.micro ? { micro: f.micro } : {}) }) as Recipe;

/** Log `servings` of a past food on `day` (today or earlier; the entry carries no recipe link, since the recipe it came from is gone). Returns the sentence to show and an Undo that removes only that entry. A day ahead is refused: there is no recipe to plan. */
export function logPastFood(ports: Pick<Ports, 'addDietEntry' | 'removeDietEntry'>, food: Pick<Recipe, 'n' | 'kcal' | 'p' | 'c' | 'f' | 'micro' | 'cat' | 'servings' | 'usual' | 'unit' | 'plural'>, servings: number, day: string, today: string): Made {
  const nums = servingNumbers(food, servings);
  if (!nums) return { ok: false, error: 'Those numbers are out of range.' };
  const bad = day > today ? 'Only a food from your Recipes can be planned. Pick today or an earlier day.' : ateDayError(day, today);
  if (bad) return { ok: false, error: bad };
  const r = ports.addDietEntry(entryFromFood(day, { n: food.n, ...nums }));
  if (r.error || !r.id) return { ok: false, error: r.error ?? 'Couldn’t log that.' };
  const id = r.id;
  return { ok: true, text: `Logged ${food.n}: ${amountText(servings, food)} to ${day === today ? 'today' : day}.`, undo: () => ports.removeDietEntry(id, false) };
}
