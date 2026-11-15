import type { DietEntry } from '../types.ts';
import { portionBasis, totalsAt, PORTION_MIN, PORTION_STEP } from './portionBasis.js';
import type { PortionTotals } from './portionBasis.js';

/* ---------- Less and More on an eaten entry (brief nutrition-log-first-portion-row, PR a) ----------
   The entry's own numbers are scaled (new = old x new count / old count), never the recipe's, so editing a recipe later does not rewrite what was eaten.
   An entry with no recorded count reads as 1 (`portionBasis`). Rounding: each result is stored through the shared cleaners (calories whole, grams one decimal), so one Less then
   one More returns calories within 1 kcal (pinned in the test); a longer run of taps can drift by a kcal or so per tap, which the stored totals cannot avoid without a second field. */

/** The most portions an entry can reach: the stored limit of `cleanPortion`. A caller with a food's own limit (`ateMax`) passes it as `max`. */
export const ENTRY_PORTION_CEIL = 99;

/** The count the entry is stored at: its `x`, or 1 when none was recorded. */
export const entryPortion = (e: Pick<DietEntry, 'x'>): number => (e.x !== undefined && e.x > 0 ? e.x : 1);

/** The numbers of `e` at `x` portions, scaled from its own totals, or null when `x` is out of range (below 0.5, above `max`) or a total no longer fits one entry (calories over 9,999, protein, carbs or fat over their caps). */
export function portionTotalsAt(e: Pick<DietEntry, 'kcal' | 'p' | 'c' | 'f' | 'micro' | 'x'>, x: number, max = ENTRY_PORTION_CEIL): PortionTotals | null {
  if (!Number.isFinite(x) || x < PORTION_MIN || x > Math.min(max, ENTRY_PORTION_CEIL)) return null;
  const b = portionBasis(e);
  return totalsAt({ kcal: b.per.kcal, p: b.per.p, c: b.per.c ?? null, f: b.per.f ?? null, micro: b.microExact ?? null }, x);
}

/** `e` at `x` portions (numbers scaled, `x` recorded), or null when out of range (see `portionTotalsAt`). */
export function entryAtPortion<T extends Pick<DietEntry, 'kcal' | 'p' | 'c' | 'f' | 'micro' | 'x'>>(e: T, x: number, max = ENTRY_PORTION_CEIL): T | null {
  const t = portionTotalsAt(e, x, max);
  if (!t) return null;
  const { c: _c, f: _f, micro: _m, ...rest } = e;
  return { ...rest, kcal: t.kcal, p: t.p, ...(t.c !== null ? { c: t.c } : {}), ...(t.f !== null ? { f: t.f } : {}), ...(t.micro ? { micro: t.micro } : {}), x: Math.round(x * 100) / 100 } as T;
}

/** The count one step (half a portion) from the entry's own, or null when that step is out of range: Less stops at 0.5, More at `max` or where the totals stop fitting (calories 9,999). */
export function stepEntryPortion(e: Pick<DietEntry, 'kcal' | 'p' | 'c' | 'f' | 'micro' | 'x'>, dir: 1 | -1, max = ENTRY_PORTION_CEIL): number | null {
  const next = Math.round((entryPortion(e) + dir * PORTION_STEP) * 100) / 100;
  return portionTotalsAt(e, next, max) ? next : null;
}
