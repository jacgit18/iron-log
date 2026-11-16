import type { Recipe, RecipeEst } from '../types.ts';
import { macroLine } from './macroLine.js';

/* ---------- Nutrition on the recipe list (brief recipe-nutrition-badges): pure, so every rule here is a node test ----------
   Per serving, from the numbers a recipe already carries (typed, or filled by Calculate from ingredients). A recipe without a number is
   never matched by a nutrition filter and shows no badge for it; nothing here throws on a missing or odd value. */

/** The two fixed nutrition filters. Constants, not settings. */
export const HIGH_PROTEIN_G = 30;
export const UNDER_KCAL = 500;

export const NUTRITION_FILTERS = [
  { key: 'protein', label: 'High protein' },
  { key: 'kcal', label: `Under ${UNDER_KCAL} kcal` },
] as const;
export type NutritionKey = typeof NUTRITION_FILTERS[number]['key'];

const num = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** The small line on a list row, in the shared macro line (`macroLine`): "420 kcal · P 32 · C 58 · F 9 g", only the parts the recipe has, or null when it has none. */
export const nutritionBadge = (r: Pick<Recipe, 'kcal' | 'p' | 'c' | 'f'>): string | null => macroLine(r) || null;

const test: Record<NutritionKey, (r: Pick<Recipe, 'kcal' | 'p'>) => boolean> = {
  protein: r => num(r.p) && r.p >= HIGH_PROTEIN_G,
  kcal: r => num(r.kcal) && r.kcal < UNDER_KCAL,
};

/** Whether a recipe passes every selected nutrition filter (none selected: every recipe). */
export const matchesNutrition = (r: Pick<Recipe, 'kcal' | 'p'>, keys: readonly NutritionKey[]): boolean => keys.every(k => test[k](r));

/** The line on a Library recipe's page, which never has numbers until it is copied to Mine. */
export const NO_NUTRITION = 'No nutrition yet. Add this recipe to Mine, then use Calculate from ingredients in its form to fill it in.';

/** True when the page shows `estimateNote` under the summary strip (a Library recipe's numbers estimated from its lines). The vitamin box then leaves out its own "Estimated: worked out from" sentence, so the page says it once. */
export const showsEstimateNote = <T extends { est?: RecipeEst | undefined; from?: unknown }>(recipe: T): recipe is T & { est: RecipeEst } => Boolean(recipe.est && recipe.from);

/** The note under a recipe's summary strip when its numbers were estimated from the ingredient lines (brief library-recipe-nutrition): how many lines were counted, and "at least" when some were not.
 *  When the servings were estimated too, a second sentence says so. */
export function estimateNote(est: RecipeEst, servings?: number): string {
  const counted = est.of === est.n ? `All ${est.n} counted.` : `${est.of} of ${est.n} counted, so these are at least.`;
  return `Estimated from the ingredients. ${counted}${est.sEst && servings ? ` About ${servings} ${servings === 1 ? 'serving' : 'servings'}, estimated.` : ''}`;
}
