import type { Grocery, GroceryMonth, Recipe } from '../types.ts';
import { cardStock, stockContext, type CardStock, type StockContext } from './boardStock.js';
import { isDrink } from './recipeUses.js';

/* ---------- The board says what you do not have (brief ready-made-have-gate, ADR 144; changed by brief nutrition-planned-available-tray, ADR 146): a ready-made food that
   Groceries says you need is no longer tucked away. Planned, it stays planned and counts toward the 8; in the tray it sits with the rest. Either way it carries a
   "Need to buy" flag, and its tick waits until Inventory says Have. Pure; nothing is stored or deleted. ---------- */

/** A ready-made food: a recipe with no ingredient lines whose type is Ready-made. Recipes with ingredients and saved meals are never gated. */
export const isReadyMade = (r: Pick<Recipe, 'cat' | 'ing'> | undefined): boolean => !!r && r.cat === 'ready' && r.ing.length === 0;

/** Whether one food is Need today: ready-made, shown as Need (matched, its item not ticked Have, not pinned Not tracked). The context is null on a past day, in another month than today's, or with Groceries empty, so nothing waits then. */
export function isNeed(recipe: Recipe | undefined, ctx: StockContext | null): boolean {
  if (!ctx || !recipe || !isReadyMade(recipe)) return false;
  return cardStock({ gone: false, recipe }, false, ctx)?.kind === 'shopping';
}

/** The flag a card carries: a ready-made food (no ingredient lines) that Groceries shows as Need today. A recipe with ingredients and a saved meal are never flagged. `kind` is the card's at-home mark (`cardStock`). */
export const isNeedFood = (recipe: Pick<Recipe, 'cat' | 'ing'> | undefined, kind: CardStock['kind'] | undefined): boolean => kind === 'shopping' && isReadyMade(recipe);

/** The words on the flag. */
export const NEED_TO_BUY = 'Need to buy';

/** Whether a food's tick (Ate, or the plate's check) is held back: it is flagged Need to buy, and an eaten one can always be unticked. */
export const tickHeld = (needFood: boolean, eaten: boolean): boolean => needFood && !eaten;

/** Said after "Planned X for Lunch." when the food is Need today, so the flag on its card is not a surprise. */
export const PLANNED_WAITING_NOTE = ' It is flagged Need to buy until Groceries says you have it, and cannot be ticked until then.';

/** Said instead when the food is only planned for a later month: the board flags nothing outside today's month (`stockContext`), but the food is Need now, so it will be flagged once that month is today's. */
export const PLANNED_LATER_NOTE = ' Groceries shows it as Need now, so once that month starts it will be flagged Need to buy unless it is ticked Have.';

/** The note to add to the planned message: `PLANNED_WAITING_NOTE` when the food is Need and any planned day falls in today's month (from today on), `PLANNED_LATER_NOTE` when it is Need and the planned days are all in later months, else an empty string. A saved meal, a recipe with ingredients, a drink (never flagged), a food that is Have or matches nothing, and a past day never wait (`isWaiting`). Every day of today's month shares one answer, so it is worked out once, not per day. */
export function plannedWaitingNote(recipe: Recipe | undefined, days: readonly string[], today: string, g: Grocery, months: Record<string, GroceryMonth>, recipes: readonly Recipe[]): string {
  if (isDrink(recipe)) return ''; // a drink is never flagged
  const month = today.slice(0, 7);
  const now = days.some(d => d >= today && d.slice(0, 7) === month), later = days.some(d => d > today && d.slice(0, 7) !== month);
  if ((!now && !later) || !isNeed(recipe, stockContext(today, today, g, months, recipes))) return '';
  return now ? PLANNED_WAITING_NOTE : PLANNED_LATER_NOTE;
}
