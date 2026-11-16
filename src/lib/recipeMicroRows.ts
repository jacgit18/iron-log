import type { Recipe } from '../types.ts';
import type { Profile } from '../shared/profile.js';
import { fmtAmount } from './amountFormat.js';
import { isRolledUp } from './mealRollup.js';
import { microShares } from './microLine.js';
import type { MicroShare } from './microLine.js';

/* ---------- The vitamins and minerals of a recipe or ready-made food that has its own `micro` (brief recipe-auto-nutrition) ----------
   One bar per nutrient against a day's recommended amount. A meal built from linked foods keeps the part-by-part bars (`mealMicroBreakdown`), so it gets no rows here. */

export interface RecipeMicroRow extends MicroShare {
  /** Bar width, 0 to 100. */
  bar: number;
  /** "0.5 mg". */
  figure: string;
  /** For the bar's accessible name: "Manganese per serving: 0.5 mg, 23% of a day's recommended amount." */
  name: string;
}

/** The rows to draw, or an empty list when the recipe has no `micro` of its own to show (a meal rolled up from linked foods, or none stored). */
export function recipeMicroRows(r: Pick<Recipe, 'ing' | 'own' | 'micro'>, profile?: Profile, today?: string): RecipeMicroRow[] {
  if (!r.micro || isRolledUp(r)) return [];
  return microShares(r.micro, 1, profile, today).map(s => {
    const figure = `${fmtAmount(s.amount)} ${s.unit}`;
    return { ...s, bar: Math.max(0, Math.min(100, s.percent)), figure, name: `${s.label} per serving: ${figure}, ${s.percent}% of a day's recommended amount.` };
  });
}
