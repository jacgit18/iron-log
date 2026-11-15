import type { Recipe } from '../types.ts';
import { MAX_UNIT, isUnit } from '../shared/recipes.js';
import { ateMax } from './dietLog.js';

export { MAX_UNIT, isUnit };

/* ---------- Usual amount on any recipe, and unit name on a ready-made food (briefs usual-amount-and-unit, nutrition-usual-portion-field): "4 eggs" instead of "4 portions". Pure; the log control, the food's page and any recipe's page (its log bar) call these. ---------- */


/** The plural of a unit by rule: es after s, x, z, ch or sh; ies after a consonant and y; otherwise s. An odd word is fixed by typing its plural. */
export function pluralOf(unit: string): string {
  if (/(s|x|z|ch|sh)$/i.test(unit)) return `${unit}es`;
  if (/[^aeiou]y$/i.test(unit)) return `${unit.slice(0, -1)}ies`;
  return `${unit}s`;
}

type UnitFields = Pick<Recipe, 'unit' | 'plural'>;
/** The word for `n` of one serving: the unit for exactly 1, its plural for anything else (0.5 eggs); "portion" and "portions" when the food has no unit. */
export function unitWord(n: number, f: UnitFields = {}): string {
  if (!f.unit) return n === 1 ? 'portion' : 'portions';
  return n === 1 ? f.unit : (f.plural ?? pluralOf(f.unit));
}
/** "4 eggs", "1 egg", "0.5 eggs", "2 portions". */
export const amountText = (n: number, f: UnitFields = {}): string => `${n} ${unitWord(n, f)}`;

/** Where the log control's stepper opens: the usual amount, never past what one entry can hold, else 1. */
export function usualStart(r: Pick<Recipe, 'cat' | 'servings' | 'kcal' | 'p' | 'c' | 'f' | 'usual'>): number {
  const top = ateMax(r);
  return Math.min(r.usual ?? 1, top);
}
