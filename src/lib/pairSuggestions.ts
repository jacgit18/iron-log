import type { Recipe } from '../types.ts';
import { hasMacros } from './dietLog.js';
import { pairsOf } from './recipePairs.js';
import { isEatable } from './recipeUses.js';

/* ---------- The suggestion after logging (brief recipes-goes-with, part 3): what goes with the food you just logged. Pure; the Log sheet and Ate this call it. ---------- */

/** The recipes that go with `logged` that can be logged in one tap: they have calories and protein and are something you eat (not an Ingredient-only recipe). A to Z. */
export function suggestedPartners(logged: Pick<Recipe, 'id' | 'pairs'>, list: readonly Recipe[]): Recipe[] {
  return pairsOf(logged, list).filter(r => hasMacros(r) && isEatable(r));
}
