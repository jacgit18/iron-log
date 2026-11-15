import type { Micro } from '../shared/foodMicro.js';
import { liveRows, microOfRows } from './foodAmountRows.js';
import type { AmountRow } from './foodAmountRows.js';

/* ---------- Per-serving vitamin and mineral rows on the Recipe form (brief portion-scaled-micros, PR 2) ----------
   A recipe that runs on its own typed calories (no linked parts, or a meal with "Use my own numbers") shows editable amount rows, like the Ready-made form. A meal built from linked parts
   keeps rolling its amounts up from them (mealRollup) and never reads these rows. What is saved is per serving; the log control scales it by the portion (servingNumbers). Pure, so it has unit tests. */

export interface OwnAmounts { rows: AmountRow[]; cleared: boolean; micro: Micro | undefined; left: string[] }

/** The calories a save would use, from the text typed: a number, or -1 when empty or not a number (so rows that came with some calories no longer match). */
export const kcalOf = (text: string): number => { const t = text.trim(); const n = Number(t); return t && Number.isFinite(n) ? n : -1; };

/** The rows a save would keep for a recipe on its own numbers: untouched filled rows go when calories changed from the ones they came with (`cleared` says so); typed rows stay.
 *  `micro` is what those rows make, and `left` names every row left out. */
export function ownAmounts(rows: AmountRow[], kcalText: string, kcalFrom: number | undefined): OwnAmounts {
  const live = liveRows(rows, kcalOf(kcalText), kcalFrom);
  const { micro, left } = microOfRows(live.rows);
  return { rows: live.rows, cleared: live.cleared, micro, left };
}

/** The amounts to save per serving: the roll-up from the parts when the meal is built from them (`rolled`), nothing for a meal from parts that gave no numbers yet, else the typed rows. */
export function recipeMicroToSave(a: { fromParts: boolean; rolled: Micro | undefined; rows: AmountRow[]; kcalText: string; kcalFrom: number | undefined }): Micro | undefined {
  if (a.fromParts) return a.rolled;
  return ownAmounts(a.rows, a.kcalText, a.kcalFrom).micro;
}
