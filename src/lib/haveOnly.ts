import type { DietEntry, Grocery, GroceryMonth, Recipe } from '../types.ts';
import { isEaten, type Resolved } from './dietPlan.js';
import { cardStock, stockContext, type StockContext } from './boardStock.js';
import type { HandyRow } from './repeats.js';

/* ---------- The board shows what you have (brief ready-made-have-gate, ADR 144): a ready-made food that Groceries says you need is tucked away
   behind a "waiting on inventory" chip. Pure; nothing is stored or deleted, only what the board draws and counts changes. ---------- */

/** What `boardDay` reads to decide which cards wait: today, the Inventory, its month ticks and the diet log (an eaten card never waits). */
export interface HaveGate { today: string; g: Grocery; months: Record<string, GroceryMonth>; diet: readonly Pick<DietEntry, 'id'>[] }

/** A ready-made food: a recipe with no ingredient lines whose type is Ready-made. Recipes with ingredients and saved meals are never gated. */
export const isReadyMade = (r: Pick<Recipe, 'cat' | 'ing'> | undefined): boolean => !!r && r.cat === 'ready' && r.ing.length === 0;

/** Whether one food waits on inventory: ready-made, shown as Need (matched, its item not ticked Have, not pinned Not tracked). The context is null on a past day, in another month than today's, or with Groceries empty, so nothing waits then. */
export function isWaiting(recipe: Recipe | undefined, ctx: StockContext | null): boolean {
  if (!ctx || !recipe || !isReadyMade(recipe)) return false;
  return cardStock({ gone: false, recipe }, false, ctx)?.kind === 'shopping';
}

/** The plan indexes of `day`'s cards that wait: a card that is not gone, not eaten and a ready-made food that is Need. `cards` are the day's non-drink cards. */
export function waitingIndexes(day: string, gate: HaveGate, cards: readonly { r: Pick<Resolved, 'item' | 'gone' | 'recipe'>; index: number }[], recipes: readonly Recipe[]): Set<number> {
  const out = new Set<number>();
  if (!cards.length) return out;
  const ctx = stockContext(day, gate.today, gate.g, gate.months, recipes);
  if (!ctx) return out;
  for (const c of cards) if (!c.r.gone && !isEaten(c.r.item, gate.diet) && isWaiting(c.r.recipe, ctx)) out.add(c.index);
  return out;
}

/** A meal's Keep handy rows split into the rows to show and the ones waiting on inventory. */
export function splitHandy<T extends Pick<HandyRow, 'res'>>(rows: readonly T[], ctx: StockContext | null): { shown: T[]; waiting: T[] } {
  const shown: T[] = [], waiting: T[] = [];
  for (const x of rows) (isWaiting(x.res.recipe, ctx) ? waiting : shown).push(x);
  return { shown, waiting };
}

/** The chip's text. */
export const waitingText = (n: number): string => `${n} waiting on inventory`;

/** The ids of the ready-made foods that are Need today, for the planned cap: a tucked-away food does not use it up. Empty when nothing can wait (Groceries empty). */
export function waitingIds(recipes: readonly Recipe[], today: string, g: Grocery, months: Record<string, GroceryMonth>): ReadonlySet<string> {
  const out = new Set<string>();
  const ctx = stockContext(today, today, g, months, recipes);
  if (!ctx) return out;
  for (const r of recipes) if (isWaiting(r, ctx)) out.add(r.id);
  return out;
}

/** Said after "Planned X for Lunch." when the food is one the board will tuck behind the waiting chip, so a meal that still reads "Nothing planned" is not a surprise. */
export const PLANNED_WAITING_NOTE = ' It is waiting on inventory, so the board keeps it behind the chip until Groceries has it.';

/** Said instead when the food is only planned for a later month: the board does not tuck anything away outside today's month (`stockContext`), but the food is Need now, so it will wait once that month is today's. */
export const PLANNED_LATER_NOTE = ' Groceries shows it as Need now, so once that month starts it will wait on inventory unless it is ticked Have.';

/** The note to add to the planned message: `PLANNED_WAITING_NOTE` when the food is Need and any planned day falls in today's month (from today on), `PLANNED_LATER_NOTE` when it is Need and the planned days are all in later months, else an empty string. A saved meal, a recipe with ingredients, a food that is Have or matches nothing, and a past day never wait (`isWaiting`). Every day of today's month shares one answer, so it is worked out once, not per day. */
export function plannedWaitingNote(recipe: Recipe | undefined, days: readonly string[], today: string, g: Grocery, months: Record<string, GroceryMonth>, recipes: readonly Recipe[]): string {
  const month = today.slice(0, 7);
  const now = days.some(d => d >= today && d.slice(0, 7) === month), later = days.some(d => d > today && d.slice(0, 7) !== month);
  if ((!now && !later) || !isWaiting(recipe, stockContext(today, today, g, months, recipes))) return '';
  return now ? PLANNED_WAITING_NOTE : PLANNED_LATER_NOTE;
}
