import { legacyMeals, type LegacyMeals } from '../lib/quickMeals.js';
import { useAppStore } from './useAppStore.js';

/** The old saved-meals list as a view may read it: only the meals still held back from Recipes (the 300-recipe gate) and the saved-meal to recipe record (brief saved-meals-removal). Views never read `cfg.diet.meals` themselves. */
export const useLegacyMeals = (): LegacyMeals => legacyMeals(useAppStore(s => s.cfg.diet));
