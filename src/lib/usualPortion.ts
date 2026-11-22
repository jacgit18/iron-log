import type { Recipe } from '../types.ts';
import { cleanUsual } from '../shared/recipes.js';
import { usualStart } from './foodUnit.js';

/* ---------- A changed portion becomes the food's usual (brief nutrition-usual-portion). Pure: the sheet passes in what it saw and the store write stays in the component. ---------- */

type Basis = Pick<Recipe, 'cat' | 'servings' | 'kcal' | 'p' | 'c' | 'f' | 'usual'>;

/** What one change wrote: the usual before it and after it (`undefined` = none, which opens at 1). */
export interface UsualChange { previous: number | undefined; next: number | undefined }

/** The stored usual a log at `logged` portions leaves behind. A portion of 1 is "no usual" (the stored field never holds 1), and a number the field cannot hold is left out. */
const storable = (logged: number): number | undefined => (logged === 1 ? undefined : (cleanUsual(logged) ?? undefined));

/** The change a log of `logged` portions makes to the usual, or null when it makes none. It compares with what the sheet opened at (`usualStart`, which is capped at what one entry can hold), so logging at the opening portion never rewrites the number or asks for Undo. */
export function usualChange(recipe: Basis, logged: number): UsualChange | null {
  if (logged === usualStart(recipe)) return null;
  const next = storable(logged);
  if (next === recipe.usual) return null; // the number stored is already what this log would write
  if (next === undefined && logged !== 1) return null; // an amount the field cannot hold: keep the old usual
  return { previous: recipe.usual, next };
}

/** The usual to write back for Undo, or null when it must not (another change has been saved since, so this one's number is no longer the stored one). `{ usual: undefined }` clears it. */
export const undoUsual = (stored: number | undefined, change: UsualChange): { usual: number | undefined } | null => (stored === change.next ? { usual: change.previous } : null);

/** `recipe` with its usual set to `usual`; `undefined` removes the field (the object is new, the input is not touched). */
export function withUsual<T extends { usual?: number }>(recipe: T, usual: number | undefined): T {
  const { usual: _old, ...rest } = recipe;
  return (usual === undefined ? rest : { ...rest, usual }) as T;
}

/** The usual a Less or More on an eaten row saves (brief nutrition-log-first-portion-row): only for a food logged today from a recipe that still exists (`recipe` given, `entryDay` is `today`); an earlier day leaves it alone. Same rule as the portion sheet's `usualChange`. */
export const usualAfterStep = (entryDay: string, today: string, recipe: Basis | undefined, count: number): UsualChange | null =>
  recipe && entryDay === today ? usualChange(recipe, count) : null;

/** The sentence and button label after a Less or More on an eaten row: the nudge changed this entry only, and saving the count as the food's usual is the person's tap (button review N3). */
export const nudgeSentence = (name: string, amount: string): string => `${name}, ${amount}.`;
export const saveUsualLabel = (amount: string): string => `Save ${amount} as my usual`;

/** What the Undo of a saved usual does now (brief nutrition-log-first-portion-row): the recipe is gone, its usual was changed since (leave it), or write `usual` back. Pure; the component makes the write and says the sentence. */
export type UndoOutcome = { kind: 'gone' } | { kind: 'changed' } | { kind: 'write'; usual: number | undefined };
export const undoUsualOutcome = (recipe: { usual?: number } | undefined, change: UsualChange): UndoOutcome => {
  if (!recipe) return { kind: 'gone' };
  const back = undoUsual(recipe.usual, change);
  return back ? { kind: 'write', usual: back.usual } : { kind: 'changed' };
};
