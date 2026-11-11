import { MAX_PLAN_AHEAD } from '../shared/diet.js';
import type { DietEntry, PlanItem, PlanSlot, Recipe } from '../types.ts';
import { amountText, usualStart } from './foodUnit.js';
import { ateEntry, oldestDay, shiftDay } from './dietLog.js';
import { inWindow } from './dietPlan.js';
import { SLOT_LABEL } from './weekBoard.js';

/* ---------- The one control for logging or planning a recipe (brief log-or-plan-control). Today or an earlier day logs what was eaten (through `ateEntry`, the function the old the log control and the portion sheet shared); a day ahead plans it into a meal on the Nutrition board. Pure: the store is passed in as `Ports`. ---------- */

/** The days the control offers: back as far as the log keeps entries (the portion sheet's `oldestDay`), ahead as far as the board can plan (`inWindow`, today plus MAX_PLAN_AHEAD days). */
export const dayRange = (today: string): { min: string; max: string } => ({ min: oldestDay(today), max: shiftDay(today, MAX_PLAN_AHEAD) });

/** A day after today is planned, not logged. */
export const isAhead = (day: string, today: string): boolean => day > today;

/** The control's button word for `day`. */
export const actionWord = (day: string, today: string): 'Log' | 'Plan' => (isAhead(day, today) ? 'Plan' : 'Log');

/** The portion the planner can hold: half steps, 0.5 to 10. */
const planPortionOk = (n: number): boolean => n >= 0.5 && n <= 10 && n * 2 === Math.round(n * 2);

/** What the control opens at: the recipe's usual amount, else 1. */
export const startAmount = (r: Parameters<typeof usualStart>[0]): number => usualStart(r);

/** The slice of the store the control uses (the real store's methods have these shapes). */
export interface Ports {
  addDietEntry(d: Omit<DietEntry, 'id'>): { id: string | null; error: string | null };
  removeDietEntry(id: string, undoNotice?: boolean): void;
  addPlanItem(day: string, kind: 'r' | 'm', id: string, slot?: PlanSlot): string | null;
  setPlanPortion(day: string, index: number, portion: number): void;
  removePlanItem(day: string, index: number): void;
  plan(): Record<string, PlanItem[]>;
}

export type Made = { ok: true; text: string; undo: () => void } | { ok: false; error: string };

const fail = (error: string): Made => ({ ok: false, error });

/** Log `servings` of `recipe` on `day` when it is today or earlier, or plan it into `meal` when `day` is ahead. Returns the sentence to show and an Undo that removes only what this call made. */
export function logOrPlan(ports: Ports, recipe: Pick<Recipe, 'id' | 'n' | 'kcal' | 'p' | 'c' | 'f' | 'micro' | 'cat' | 'servings' | 'usual' | 'unit' | 'plural'>, servings: number, day: string, today: string, meal: PlanSlot | null): Made {
  const amount = amountText(servings, recipe);
  if (!isAhead(day, today)) {
    const made = ateEntry(recipe, servings, day, today);
    if ('error' in made) return fail(made.error);
    const r = ports.addDietEntry(made.entry);
    if (r.error || !r.id) return fail(r.error ?? 'Couldn’t log that.');
    const id = r.id;
    return { ok: true, text: `Logged ${amount} to ${day === today ? 'today' : day}.`, undo: () => ports.removeDietEntry(id, false) };
  }
  if (!inWindow(day, today)) return fail('You can plan today and the next two weeks.');
  if (!meal) return fail('Pick a meal.');
  if (!planPortionOk(servings)) return fail('A planned portion is half steps, up to 10.');
  const before = ports.plan()[day]?.length ?? 0;
  const e = ports.addPlanItem(day, 'r', recipe.id, meal);
  if (e) return fail(e);
  const list = ports.plan()[day] ?? [];
  const at = list.length - 1;
  if (list.length !== before + 1 || list[at]?.id !== recipe.id || list[at]?.s !== meal) return fail('Couldn’t plan that.');
  if (servings !== 1) ports.setPlanPortion(day, at, servings);
  // Undo finds the item again by what it is (a day never holds the same food twice in one meal), so a later change to the day's list moves nothing else.
  const undo = () => {
    const now = ports.plan()[day] ?? [];
    const i = now.findIndex(x => x.k === 'r' && x.id === recipe.id && x.s === meal);
    if (i >= 0) ports.removePlanItem(day, i);
  };
  return { ok: true, text: `Planned ${amount} for ${SLOT_LABEL[meal]} on ${day}.`, undo };
}
