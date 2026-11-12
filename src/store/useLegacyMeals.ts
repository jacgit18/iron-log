import { legacyMeals, type LegacyMeals } from '../lib/quickMeals.js';
import type { AppState } from './types.ts';
import { useAppStore } from './useAppStore.js';

/** What `useLegacyMeals` reads from the store: the gate applied to the diet settings. Its own function so a node test can call it with a store state. */
export const legacyOf = (s: Pick<AppState, 'cfg'>): LegacyMeals => legacyMeals(s.cfg.diet);

/** The old saved-meals list as a view may read it: only the meals still held back from Recipes (the 300-recipe gate) and the saved-meal to recipe record (brief saved-meals-removal). Views never read `cfg.diet.meals` themselves. */
export const useLegacyMeals = (): LegacyMeals => useAppStore(legacyOf); // the gate keeps one object per diet settings, so the selector's answer is stable between renders
