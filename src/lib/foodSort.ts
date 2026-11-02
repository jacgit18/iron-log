import type { FoodHit } from '../shared/foods.js';
import { nameCmp } from './sort.js';
import type { SortOption } from './sortChoice.js';

// Sort for the USDA food search results. It orders only the page already fetched (up to 8 foods): the search itself, the server and what is
// asked of USDA are untouched. Relevance is the order the server returned and is the default. Every other order ends in name, then id.

export const FOOD_SORTS = [
  { key: 'relevance', label: 'Best match' },
  { key: 'name', label: 'Name A to Z' },
  { key: 'kcal', label: 'Calories, low to high' },
  { key: 'protein', label: 'Protein, high to low' },
] as const satisfies readonly SortOption[];
export type FoodSort = typeof FOOD_SORTS[number]['key'];
export const DEFAULT_FOOD_SORT: FoodSort = 'relevance';

/** The hits in the chosen order (a new array; the input is not changed). */
export function sortFoodHits(hits: readonly FoodHit[], sort: FoodSort): FoodHit[] {
  const tie = nameCmp<FoodHit>(h => h.name, h => String(h.id).padStart(12, '0'));
  const out = [...hits];
  if (sort === 'name') return out.sort(tie);
  if (sort === 'kcal') return out.sort((a, b) => a.kcal - b.kcal || tie(a, b));
  if (sort === 'protein') return out.sort((a, b) => b.p - a.p || tie(a, b));
  return out;
}
