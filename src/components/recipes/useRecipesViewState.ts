import { useCallback, useSyncExternalStore } from 'react';
import { getRecipesViewState, setRecipesViewState, subscribeRecipesViewState, type RecipesViewState } from '../../lib/recipesViewState.js';

/** One field of the kept Recipes view (lib/recipesViewState.ts) as `[value, set]`, like useState, but it survives leaving Recipes and coming back. */
export function useKept<K extends keyof RecipesViewState>(key: K): [RecipesViewState[K], (v: RecipesViewState[K]) => void] {
  const value = useSyncExternalStore(subscribeRecipesViewState, () => getRecipesViewState()[key]);
  const set = useCallback((v: RecipesViewState[K]) => setRecipesViewState(key, v), [key]);
  return [value, set];
}
