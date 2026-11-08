import type { CatalogItem, Grocery, GroceryMonth, Recipe } from '../types.ts';
import { recipeFromCatalog } from './recipeDraft.js';
import { haveBadge, inTab, type RecipeTab } from './recipeList.js';
import { pantryStatus } from './recipePantry.js';

/* ---------- Library rows (brief recipes-used-as-ingredients-tab, part B): the Library list tells what Mine does: a type tab, how much is at home, and whether it is already yours. Pure; Recipes.tsx only draws it. ---------- */

/** The tabs the Library offers: Foods are ready-made and are not in the Library, so they are left out. */
export const LIBRARY_TABS = [{ key: 'all', label: 'All' }, { key: 'meals', label: 'Meals' }, { key: 'ingredients', label: 'Ingredients' }, { key: 'drinks', label: 'Drinks' }] as const satisfies readonly { key: RecipeTab; label: string }[];
export type LibraryTab = typeof LIBRARY_TABS[number]['key'];

/** The recipe a Library item would become (nothing is written), or null for an item with no recipe. */
const asRecipe = (it: CatalogItem): Recipe | null => recipeFromCatalog(it, []);

/** Whether a Library item shows under a tab, by what its copy would be used as. */
export function inLibraryTab(it: CatalogItem, tab: LibraryTab): boolean {
  if (tab === 'all') return true;
  const r = asRecipe(it);
  return !!r && inTab(r, tab);
}

/** "2 of 5" for how many of a Library recipe's ingredients are at home this month, and whether it is all of them; null when it lists none. */
export function libraryHave(it: CatalogItem, mine: readonly Recipe[], g: Grocery, month: GroceryMonth): { text: string; all: boolean } | null {
  const r = asRecipe(it);
  return r ? haveBadge(pantryStatus(r, g, month, mine)) : null;
}

/** Whether a Library item is already in Mine (a copy of it is there). */
export const inMine = (it: CatalogItem, mine: readonly Recipe[]): boolean => mine.some(r => r.from === it.id);
