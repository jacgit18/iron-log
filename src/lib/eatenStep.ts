import type { DietEntry, Recipe } from '../types.ts';
import { ateMax } from './dietLog.js';
import { amountText } from './foodUnit.js';
import { PORTION_CEIL, PORTION_MIN, PORTION_STEP, stepEntryCount } from './portionBasis.js';

/* ---------- Less and More on an eaten row (brief nutrition-log-first-portion-row, PR b). Pure: which rows get a stepper, what the amount reads, where a step lands. The store writes (`setDietPortion`, `setPlanPortion`) stay in the components. ---------- */

/** The board's status line: a sentence and, when the change can be taken back, its Undo. */
/** What a status line is told: the sentence, an Undo for what it says, and (optional) one button that offers the next step, such as saving a usual portion. */
export interface SayAction { label: string; run: () => void }
export type Say = (t: string, undo?: () => void, action?: SayAction) => void;

type Stepped = Pick<DietEntry, 'kcal' | 'p' | 'c' | 'f' | 'micro' | 'x'>;
type Unit = Pick<Recipe, 'cat' | 'servings' | 'kcal' | 'p' | 'c' | 'f' | 'usual' | 'unit' | 'plural'>;

/** The amount on an eaten row: "1.5 portions" (or the food's own unit) for a food with a recipe behind it, "x 1.5" for one without. */
export const eatenAmount = (e: Pick<DietEntry, 'x'>, recipe?: Unit): string => {
  const x = e.x !== undefined && e.x > 0 ? e.x : 1;
  return recipe ? amountText(x, recipe) : `x ${x}`;
};

/** The most portions More offers for an entry: the recipe's own limit when it has one (`ateMax`), else the shared ceiling. `entryTotalsAt` still holds it to what the totals can fit. */
export const eatenMax = (recipe?: Unit): number => (recipe ? ateMax(recipe) : PORTION_CEIL);

/** What an eaten row draws between its name and its mark: the amount, and the count Less and More would save (null = no step, the button is disabled). */
export function rowStepper(e: Stepped, recipe?: Unit): { text: string; less: number | null; more: number | null } {
  const max = eatenMax(recipe);
  return { text: eatenAmount(e, recipe), less: stepEntryCount(e, -1, max), more: stepEntryCount(e, 1, max) };
}

/** The one entry a ticked planned recipe card logged, or undefined: none (not ticked, or the entry was deleted) or more than one (a saved meal) means there is nothing to step together. */
export function loggedEntry(ids: readonly string[] | undefined, entries: readonly DietEntry[]): DietEntry | undefined {
  const found = (ids ?? []).map(id => entries.find(e => e.id === id)).filter((e): e is DietEntry => !!e);
  return found.length === 1 ? found[0] : undefined;
}

/** The plan portion one step from `portion` for a recipe card that is not ticked, or null: Less stops at 0.5, More at 10. */
export function plannedStep(portion: number, dir: 1 | -1): number | null {
  const next = Math.round((portion + dir * PORTION_STEP) * 100) / 100;
  return next < PORTION_MIN || next > PORTION_CEIL ? null : next;
}

/** One step of a ticked card, from the logged entry's own count (never the plan's, so an edit made to the entry is kept): the entry's new count, and the plan's portion to match when that count is one the plan can hold (a half step from 0.5 to 10; otherwise the plan is left alone). Null when the entry has no step. */
export function plannedEntryStep(entry: Stepped, dir: 1 | -1, max?: number): { count: number; plan: number | null } | null {
  const count = stepEntryCount(entry, dir, max);
  if (count === null) return null;
  return { count, plan: count >= PORTION_MIN && count <= PORTION_CEIL && count * 2 === Math.round(count * 2) ? count : null };
}
