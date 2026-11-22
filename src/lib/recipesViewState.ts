import type { RecipeCategory } from '../types.js';
import type { NutritionKey } from './recipeNutrition.js';
import type { FoodSection } from './foodSections.js';

/* What the Recipes list shows is kept while the person visits another Daily section and comes back (brief recipes-desktop-layouts, 2b):
   search, the open section, Recent, category, Can make, tags, nutrition and the recipe open in the pane.
   It lives in memory for this visit: not on the device, not in the address, not in the app store (so no sync or AppState change). A reload clears it.
   The loaded Library page is not kept; the Library section loads when opened. */
export interface RecipesViewState {
  /** The Foods section last used this visit (brief foods-made-and-store-bought); null until one is picked. */
  sec: FoodSection | null;
  q: string;
  recent: boolean;
  cat: RecipeCategory | null;
  canMake: boolean;
  tagSel: string[];
  nutSel: NutritionKey[];
  selId: string | null;
}

export const INITIAL_VIEW_STATE: Readonly<RecipesViewState> = { sec: null, q: '', recent: false, cat: null, canMake: false, tagSel: [], nutSel: [], selId: null };

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

/** After Save on a screen with the pane: back to the list with the saved recipe open, shown in its section with no search or filter hiding it. `sec` is the section it belongs in (kept when omitted). */
export function showSavedRecipe(id: string, sec?: FoodSection): void {
  state = { ...state, ...(sec ? { sec } : {}), q: '', recent: false, cat: null, canMake: false, tagSel: [], nutSel: [], selId: id };
  listeners.forEach(fn => fn());
}
