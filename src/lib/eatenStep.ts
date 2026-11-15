import type { DietEntry, Recipe } from '../types.ts';
import { ateMax } from './dietLog.js';
import { amountText } from './foodUnit.js';
import { entryTotalsAt, PORTION_CEIL, PORTION_MIN, PORTION_STEP, stepEntryCount } from './portionBasis.js';

/* ---------- Less and More on an eaten row (brief nutrition-log-first-portion-row, PR b). Pure: which rows get a stepper, what the amount reads, where a step lands. The store writes (`setDietPortion`, `setPlanPortion`) stay in the components. ---------- */

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

/** Whether a row on `day` has a stepper: today and earlier days (an entry is never on a day ahead; this keeps the rule in one place). */
export const hasStepper = (day: string, today: string): boolean => day <= today;

/** The one entry a ticked planned recipe card logged, or undefined: none (not ticked, or the entry was deleted) or more than one (a saved meal) means there is nothing to step together. */
export function loggedEntry(ids: readonly string[] | undefined, entries: readonly DietEntry[]): DietEntry | undefined {
  const found = (ids ?? []).map(id => entries.find(e => e.id === id)).filter((e): e is DietEntry => !!e);
  return found.length === 1 ? found[0] : undefined;
}

/** The plan portion one step from `portion` for a recipe card, or null: Less stops at 0.5, More at 10, and a ticked card (`entry` given) also stops where the logged entry could not take the new count, so the plan and the entry never disagree. */
export function plannedStep(portion: number, dir: 1 | -1, entry?: Stepped): number | null {
  const next = Math.round((portion + dir * PORTION_STEP) * 100) / 100;
  if (next < PORTION_MIN || next > PORTION_CEIL) return null;
  if (entry && !entryTotalsAt(entry, next)) return null;
  return next;
}
