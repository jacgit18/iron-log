import type { RecipeCategory } from '../types.js';
import type { LibraryTab } from './libraryRows.js';
import type { NutritionKey } from './recipeNutrition.js';
import type { RecipeTab } from './recipeList.js';

/* What the Recipes list shows is kept while the person visits another Daily section and comes back (brief recipes-desktop-layouts, 2b):
   search, type tab, Recent, category, Can make, tags, nutrition, Mine / Library, the Library tab and the recipe open in the pane.
   It lives in memory for this visit: not on the device, not in the address, not in the app store (so no sync or AppState change). A reload clears it.
   The loaded Library page is not kept; it loads again. */
export interface RecipesViewState {
  src: 'mine' | 'library';
  q: string;
  tab: RecipeTab;
  recent: boolean;
  cat: RecipeCategory | null;
  canMake: boolean;
  tagSel: string[];
  nutSel: NutritionKey[];
  libTab: LibraryTab;
  selId: string | null;
}

export const INITIAL_VIEW_STATE: Readonly<RecipesViewState> = { src: 'mine', q: '', tab: 'all', recent: false, cat: null, canMake: false, tagSel: [], nutSel: [], libTab: 'all', selId: null };

let state: RecipesViewState = { ...INITIAL_VIEW_STATE };
const listeners = new Set<() => void>();

export const getRecipesViewState = (): RecipesViewState => state;
export const subscribeRecipesViewState = (fn: () => void): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Change one field; a value equal to the current one (same reference) changes nothing and tells nobody. */
export function setRecipesViewState<K extends keyof RecipesViewState>(key: K, value: RecipesViewState[K]): void {
  if (Object.is(state[key], value)) return;
  state = { ...state, [key]: value };
  listeners.forEach(fn => fn());
}

/** Back to the start (the tests; sign-out reloads the page, which clears it). */
export function resetRecipesViewState(): void {
  state = { ...INITIAL_VIEW_STATE };
  listeners.forEach(fn => fn());
}

/** After Save on a screen with the pane: back to the list with the saved recipe open, shown under All with no search or filter hiding it. */
export function showSavedRecipe(id: string): void {
  state = { ...state, src: 'mine', q: '', tab: 'all', recent: false, cat: null, canMake: false, tagSel: [], nutSel: [], selId: id };
  listeners.forEach(fn => fn());
}
