import { MAX_RECIPE_NAME } from '../shared/recipes.js';
import type { Recipe, RecipeIngredient, SavedItem, SavedMeal } from '../types.ts';
import { hasMacros } from './dietLog.js';

/* ---------- A saved meal becomes a Recipes meal (brief saved-meals-into-recipes). Pure; the move calls it once per saved meal. ---------- */

const TOLERANCE = 0.03;
/** Whether a saved amount agrees with the recipe's per-serving amount at `k` servings, within 3%; a recipe amount of 0 agrees only with a saved amount of about 0. */
const agrees = (saved: number, per: number, k: number): boolean => (per > 0 ? Math.abs(saved / per - k) / k <= TOLERANCE : saved <= 0.5);

/** How many servings of `r` a saved food was, when its numbers still agree with the recipe's per-serving numbers (calories, protein, and carbs and fat when the saved food has them, each within 3%), else null. A recipe with 0 protein (a drink) can still match. */
function servingsOf(item: SavedItem, r: Recipe): number | null {
  if (!hasMacros(r) || !r.kcal) return null;
  const k = item.kcal / r.kcal;
  if (!(k >= 0.1 && k <= 100) || !agrees(item.p, r.p!, k)) return null;
  for (const [saved, per] of [[item.c, r.c], [item.f, r.f]] as const) {
    if (saved === undefined) continue; // the saved food had no figure, so the recipe's can only add one
    if (per === undefined || !agrees(saved, per, k)) return null; // a saved figure the recipe no longer has, or has changed: keep the saved totals
  }
  return Math.round(k * 100) / 100;
}

/** The recipe `item` was logged from, only when it can be a part of a meal: still there, not a sauce or seasoning, and its numbers still match. */
function partOf(item: SavedItem, recipes: readonly Recipe[]): { recipe: Recipe; q: number } | null {
  const recipe = item.from ? recipes.find(r => r.id === item.from) : undefined;
  if (!recipe || recipe.cat === 'sauces' || recipe.cat === 'seasonings') return null;
  const q = servingsOf(item, recipe);
  return q === null ? null : { recipe, q };
}

const sum = (items: readonly SavedItem[], pick: (i: SavedItem) => number | undefined): number | undefined => (items.every(i => pick(i) !== undefined) ? Math.round(items.reduce((a, i) => a + pick(i)!, 0) * 10) / 10 : undefined);

/** `name`, or when a recipe already has it " (saved)", then " (saved 2)" and so on; the name is cut so the end always fits. */
function freeName(name: string, recipes: readonly Recipe[]): string {
  const taken = new Set(recipes.map(r => r.n.trim().toLowerCase()));
  const fit = (suffix: string) => `${name.slice(0, MAX_RECIPE_NAME - suffix.length)}${suffix}`;
  if (!taken.has(name.slice(0, MAX_RECIPE_NAME).trim().toLowerCase())) return name.slice(0, MAX_RECIPE_NAME);
  for (let i = 1; ; i++) { const n = fit(i === 1 ? ' (saved)' : ` (saved ${i})`); if (!taken.has(n.trim().toLowerCase())) return n; }
}

/** The meal a saved meal becomes, as a draft to save. Every food still a recipe with matching numbers: the meal links them (so it rolls up from them; the numbers are the saved ones to within 3%). Otherwise the saved totals, kept exactly, with the foods listed by name. A name another recipe already has gets " (saved)". */
export function savedMealToRecipe(meal: SavedMeal, recipes: readonly Recipe[]): Omit<Recipe, 'id'> {
  const n = freeName(meal.n, recipes);
  const parts = meal.items.map(i => partOf(i, recipes));
  if (parts.every(p => p !== null)) {
    const ing: RecipeIngredient[] = parts.map(p => ({ n: p!.recipe.n, rid: p!.recipe.id, q: p!.q }));
    return { n, cat: 'other', servings: 1, ing, steps: [] };
  }
  const kcal = sum(meal.items, i => i.kcal), p = sum(meal.items, i => i.p), c = sum(meal.items, i => i.c), f = sum(meal.items, i => i.f);
  return { n, cat: 'other', servings: 1, ing: meal.items.map(i => ({ n: i.n })), steps: [], ...(kcal !== undefined ? { kcal } : {}), ...(p !== undefined ? { p } : {}), ...(c !== undefined ? { c } : {}), ...(f !== undefined ? { f } : {}) };
}
