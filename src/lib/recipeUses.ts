import { RECIPE_USE_LABEL, cleanUses } from '../shared/recipes.js';
import type { Recipe, RecipeCategory, RecipeUse } from '../types.ts';

/* ---------- Used as (brief recipes-used-as-ingredients-tab): what a recipe is, as one or more labels. Pure; the tabs, the row tag and the forms call this. ---------- */

/** The labels a recipe starts on, from its category alone: sauces and seasonings are ingredients, protein, carbs and sides are meals and ingredients, drinks are drinks, the rest meals. */
export function defaultUsesFor(cat: RecipeCategory): RecipeUse[] {
  switch (cat) {
    case 'drinks': return ['drink'];
    case 'sauces': case 'seasonings': return ['ingredient'];
    case 'protein': case 'carbs': case 'sides': return ['meal', 'ingredient'];
    case 'ready': return ['ready'];
    default: return ['meal'];
  }
}

/** A recipe's labels: the ones it was saved with, else worked out from its category, and for a ready-made food from its Type (an untyped food is Ready to eat). Nothing is written. */
export function usesOf(r: Pick<Recipe, 'cat' | 'type' | 'uses'>): RecipeUse[] {
  const saved = cleanUses(r.uses);
  if (saved) return saved;
  if (r.cat === 'ready') return [r.type ?? 'ready'];
  return defaultUsesFor(r.cat);
}

export const hasUse = (r: Pick<Recipe, 'cat' | 'type' | 'uses'>, u: RecipeUse): boolean => usesOf(r).includes(u);

/** Whether a recipe can be eaten as it is: a meal, a ready-to-eat food or a drink. Only these get a Log button. */
export const isEatable = (r: Pick<Recipe, 'cat' | 'type' | 'uses'>): boolean => usesOf(r).some(u => u !== 'ingredient');

/** The tag on a row: the labels in words, "Meal + Ingredient". */
export const usesTag = (r: Pick<Recipe, 'cat' | 'type' | 'uses'>): string => usesOf(r).map(u => RECIPE_USE_LABEL[u]).join(' + ');

/** The labels a form saves after a chip is pressed: toggled in or out, never empty, and Drink alone. */
export function toggleUse(current: readonly RecipeUse[], u: RecipeUse): RecipeUse[] {
  if (u === 'drink') return current.includes('drink') ? [...current] : ['drink'];
  const without = current.filter(x => x !== u && x !== 'drink');
  const next = current.includes(u) ? without : [...without, u];
  return next.length ? cleanUses(next) ?? current.slice() : current.slice();
}
