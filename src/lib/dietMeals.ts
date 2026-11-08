import type { DietEntry, SavedItem, SavedMeal } from '../types.ts';
import { MAX_DIET_PER_DAY } from '../shared/diet.js';
import { entriesOn, fmtNum } from './dietLog.js';

/* ---------- Saved meals (brief diet-saved-meals): total one and plan logging it. Making, renaming and deleting moved to Recipes (brief saved-meals-into-recipes). Pure; the store and the view call these. ---------- */

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
