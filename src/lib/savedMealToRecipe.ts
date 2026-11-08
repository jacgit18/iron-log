import { MAX_RECIPE_NAME } from '../shared/recipes.js';
import type { Recipe, RecipeIngredient, SavedItem, SavedMeal } from '../types.ts';
import { hasMacros } from './dietLog.js';

/* ---------- A saved meal becomes a Recipes meal (brief saved-meals-into-recipes). Pure; the move calls it once per saved meal. ---------- */

/** How many servings of `r` a saved food was, when its numbers still agree with the recipe's per-serving numbers (calories and protein on one ratio, within 3%), else null. */
function servingsOf(item: SavedItem, r: Recipe): number | null {
  if (!hasMacros(r) || !r.kcal || !r.p) return null;
  const k = item.kcal / r.kcal, p = item.p / r.p;
  if (!(k >= 0.1 && k <= 100) || Math.abs(k - p) / k > 0.03) return null;
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

/** The meal a saved meal becomes, as a draft to save. Every food still a recipe with matching numbers: the meal links them (so it rolls up from them, with the same numbers today). Otherwise the saved totals, kept exactly, with the foods listed by name. A name another recipe already has gets " (saved)". */
export function savedMealToRecipe(meal: SavedMeal, recipes: readonly Recipe[]): Omit<Recipe, 'id'> {
  const taken = new Set(recipes.map(r => r.n.trim().toLowerCase()));
  const clash = taken.has(meal.n.trim().toLowerCase());
  const n = (clash ? `${meal.n} (saved)` : meal.n).slice(0, MAX_RECIPE_NAME);
  const parts = meal.items.map(i => partOf(i, recipes));
  if (parts.every(p => p !== null)) {
    const ing: RecipeIngredient[] = parts.map(p => ({ n: p!.recipe.n, rid: p!.recipe.id, q: p!.q }));
    return { n, cat: 'other', servings: 1, ing, steps: [] };
  }
  const kcal = sum(meal.items, i => i.kcal), p = sum(meal.items, i => i.p), c = sum(meal.items, i => i.c), f = sum(meal.items, i => i.f);
  return { n, cat: 'other', servings: 1, ing: meal.items.map(i => ({ n: i.n })), steps: [], ...(kcal !== undefined ? { kcal } : {}), ...(p !== undefined ? { p } : {}), ...(c !== undefined ? { c } : {}), ...(f !== undefined ? { f } : {}) };
}
