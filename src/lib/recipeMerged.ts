import type { CatalogItem, Recipe } from '../types.ts';
import { inMine } from './libraryRows.js';

/* ---------- Library rows next to yours (brief recipes-mine-library-merge, now the Library section of brief foods-made-and-store-bought): the library recipes you do not have yet. Pure; Recipes.tsx only draws it. ---------- */

export interface MergedGroups { mine: Recipe[]; library: CatalogItem[] }

/** Your recipes (as given, already searched, filtered and sorted) and the library items that are not yours yet: a library recipe with a copy in Mine is listed only under Mine. */
export function mergedGroups(mine: readonly Recipe[], allMine: readonly Recipe[], library: readonly CatalogItem[]): MergedGroups {
  return { mine: [...mine], library: library.filter(it => !inMine(it, allMine)) };
}

/** Whether the "Your nutrition and tag filters do not apply here" line shows in the box. */
export const filtersSkipLibrary = (nutrition: readonly string[], tags: readonly string[]): boolean => nutrition.length > 0 || tags.length > 0;
