import type { Recipe } from '../types.ts';

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
const g = (v: number) => String(Math.round(v * 10) / 10);

/** The small line on a list row: "420 kcal · 32 g protein", only the parts the recipe has, or null when it has neither. */
export function nutritionBadge(r: Pick<Recipe, 'kcal' | 'p'>): string | null {
  const parts = [num(r.kcal) ? `${Math.round(r.kcal)} kcal` : '', num(r.p) ? `${g(r.p)} g protein` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

const test: Record<NutritionKey, (r: Pick<Recipe, 'kcal' | 'p'>) => boolean> = {
  protein: r => num(r.p) && r.p >= HIGH_PROTEIN_G,
  kcal: r => num(r.kcal) && r.kcal < UNDER_KCAL,
};

/** Whether a recipe passes every selected nutrition filter (none selected: every recipe). */
export const matchesNutrition = (r: Pick<Recipe, 'kcal' | 'p'>, keys: readonly NutritionKey[]): boolean => keys.every(k => test[k](r));

/** The line on a Library recipe's page, which never has numbers until it is copied to Mine. */
export const NO_NUTRITION = 'No nutrition yet. Add this recipe to Mine, then use Calculate from ingredients in its form to fill it in.';
