import type { DietEntry, SavedItem, SavedMeal } from '../types.ts';
import { MAX_DIET_PER_DAY, MAX_MEALS, MAX_MEAL_ITEMS, MAX_MEAL_NAME, mealKey } from '../shared/diet.js';
import { entriesOn, fmtNum } from './dietLog.js';
import { sortByName } from './sort.js';

/* ---------- Saved meals (brief diet-saved-meals): make one from logged foods, replace or rename it, total it, plan logging it. Pure; the store and the view call these. ---------- */

type Made = { meals: SavedMeal[]; error: null } | { meals: null; error: string };
const fail = (error: string): Made => ({ meals: null, error });

const item = (e: DietEntry): SavedItem => ({ n: e.n, kcal: e.kcal, p: e.p, ...(e.c !== undefined ? { c: e.c } : {}), ...(e.f !== undefined ? { f: e.f } : {}), ...(e.from ? { from: e.from } : {}) });

/** `meals` with a new meal made from the ticked `entries` (in the order given), named `name`. A meal with the same name (case-blind) is replaced in place, keeping its id; otherwise the new one goes last. An error text when the name is blank, nothing or too much is ticked, or the list is full. */
export function saveMeal(meals: SavedMeal[], name: string, entries: DietEntry[], id: string): Made {
  const n = name.trim().slice(0, MAX_MEAL_NAME);
  if (!n) return fail('Give the meal a name.');
  if (entries.length === 0) return fail('Tick at least one food.');
  if (entries.length > MAX_MEAL_ITEMS) return fail(`A meal can hold ${MAX_MEAL_ITEMS} foods.`);
  const items = entries.map(item);
  const at = meals.findIndex(m => mealKey(m.n) === mealKey(n));
  if (at >= 0) return { meals: meals.map((m, i) => (i === at ? { id: m.id, n, items } : m)), error: null };
  if (meals.length >= MAX_MEALS) return fail(`You can save ${MAX_MEALS} meals. Delete one to save another.`);
  return { meals: [...meals, { id, n, items }], error: null };
}

/** `meals` with meal `id` renamed. An error text for a blank name, one another meal has, or a meal that is gone. */
export function renameMeal(meals: SavedMeal[], id: string, name: string): Made {
  const n = name.trim().slice(0, MAX_MEAL_NAME);
  if (!n) return fail('Give the meal a name.');
  if (!meals.some(m => m.id === id)) return fail('That meal is gone.');
  if (meals.some(m => m.id !== id && mealKey(m.n) === mealKey(n))) return fail('You already have a meal with that name.');
  return { meals: meals.map(m => (m.id === id ? { ...m, n } : m)), error: null };
}

/** What a meal adds up to. */
export const mealTotals = (m: SavedMeal): { kcal: number; foods: number } => ({ kcal: m.items.reduce((a, i) => a + i.kcal, 0), foods: m.items.length });

/** A meal in one line: "Breakfast · 3 foods · 520 kcal". */
export function mealLine(m: SavedMeal): string {
  const t = mealTotals(m);
  return `${m.n} · ${t.foods} ${t.foods === 1 ? 'food' : 'foods'} · ${fmtNum(t.kcal)} kcal`;
}

/** What logging meal `m` on `day` would do: the foods that fit under the per-day limit, in order, and how many did not. */
export function planMeal(entries: DietEntry[], day: string, m: SavedMeal): { add: SavedItem[]; left: number } {
  const room = Math.max(0, MAX_DIET_PER_DAY - entriesOn(entries, day).length);
  return { add: m.items.slice(0, room), left: Math.max(0, m.items.length - room) };
}

/** The saved meals A to Z for display (storage order is untouched, so Manage and sync still see the order they were made in). */
export const sortedMeals = (meals: readonly SavedMeal[]): SavedMeal[] => sortByName(meals, m => m.n, m => m.id);
