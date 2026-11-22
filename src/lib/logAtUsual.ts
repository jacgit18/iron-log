import type { Recipe } from '../types.ts';
import { amountText, usualStart } from './foodUnit.js';
import { ateEntry, ateDayError, entryFromFood, fmtNum, hasMacros, servingNumbers } from './dietLog.js';
import { logEntry, type Made, type Ports } from './logOrPlan.js';

/* ---------- One tap logs at the usual portion (brief nutrition-log-first-portion-row, PR b): Quick add, Log in the Recipes way and a food picked in Find food. Pure: the store is passed in as `Ports`. A day ahead is not handled here: it plans through the portion sheet. ---------- */

type Logger = Pick<Ports, 'addDietEntry' | 'removeDietEntry'>;
type Food = Pick<Recipe, 'n' | 'kcal' | 'p' | 'c' | 'f' | 'micro' | 'cat' | 'servings' | 'usual' | 'unit' | 'plural'>;

/** The sentence after a log: "Logged Oats, 1.5 portions." */
export const loggedText = (name: string, amount: string): string => `Logged ${name}, ${amount}.`;

/** Log a recipe at its usual portion on `day` (today or earlier). The answer carries the sentence and an Undo that removes exactly the entry this call made. */
export function logRecipeAtUsual(ports: Logger, recipe: Pick<Recipe, 'id'> & Food, day: string, today: string): Made {
  if (!hasMacros(recipe)) return { ok: false, error: 'Add calories and protein per serving to log this.' };
  const x = usualStart(recipe);
  const made = ateEntry(recipe, x, day, today);
  if ('error' in made) return { ok: false, error: made.error };
  return logEntry(ports, made.entry, loggedText(recipe.n, amountText(x, recipe)));
}

/** Log a food that has no recipe behind it (a Find food match from the log) as it was eaten before: its numbers are totals for `food.x` portions (1 when not recorded), kept as they are with that count, so Less then halves the right amount. The entry carries no recipe link. */
export function logFoodAtUsual(ports: Logger, food: { n: string; kcal: number; p: number; c?: number; f?: number; micro?: Recipe['micro']; x?: number }, day: string, today: string): Made {
  const x = food.x !== undefined && food.x > 0 ? food.x : 1;
  const nums = servingNumbers(food as Food, 1); // the totals as they are (this also checks they fit one entry)
  if (!nums) return { ok: false, error: 'Those numbers are out of range.' };
  const bad = ateDayError(day, today);
  if (bad) return { ok: false, error: bad };
  return logEntry(ports, entryFromFood(day, { n: food.n, ...nums, x }), loggedText(food.n, amountText(x, food as Food)));
}

/** Log a food picked from the food database at the grams chosen (Find food, Log it): `fill` already holds the numbers for those grams (`scaleFood`), kept as one entry of one portion. The answer carries the sentence ("Logged Almond milk, 240 g.") and an Undo that removes exactly that entry. */
export function logFoodGrams(ports: Logger, fill: { n: string; kcal: number; p: number; c?: number; f?: number; micro?: Recipe['micro'] }, grams: number, day: string, today: string): Made {
  const nums = servingNumbers(fill as Food, 1);
  if (!nums) return { ok: false, error: fill.kcal >= 0 && fill.kcal < 0.5 ? 'That is under 1 calorie at these grams, which can’t be logged.' : 'Those numbers are out of range.' }; // an entry needs at least 1 kcal
  const bad = ateDayError(day, today);
  if (bad) return { ok: false, error: bad };
  return logEntry(ports, entryFromFood(day, { n: fill.n, ...nums, x: 1 }), loggedText(fill.n, `${fmtNum(grams)} g`));
}
