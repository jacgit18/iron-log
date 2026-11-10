import { MICRO_MAX, MICRO_UNIT, cleanMicro } from '../shared/foodMicro.js';
import type { Micro } from '../shared/foodMicro.js';
import { NUTRIENT_KEYS } from '../shared/nutrientKeys.js';
import type { NutrientKey } from '../shared/nutrientKeys.js';
import { nutrientLabel } from './nutrientInfo.js';
import { nextFreePickerKey } from './nutrientPickerGroups.js';

/* ---------- Typed vitamin and mineral amounts on a food (brief type-food-amounts) ----------
   The One-off food form and the Ready-made form show a food's amounts as rows (nutrient, amount, unit) and turn them back into a `Micro` on save. `filled` marks a row that came
   from a lookup, a scan or an earlier save and has not been touched: it is dropped when calories change (the amounts would no longer match the portion), while a row the person typed or
   edited stays. Units offered are mg, mcg and g; IU is not (the table holds no IU factors). Pure, so the rules have unit tests. */

export const AMOUNT_UNITS = ['mg', 'mcg', 'g'] as const;
export type AmountUnit = typeof AMOUNT_UNITS[number];
export interface AmountRow { key: NutrientKey; amount: string; unit: AmountUnit; filled?: boolean }

const MCG_PER: Record<AmountUnit, number> = { mg: 1000, mcg: 1, g: 1_000_000 };

/** The rows for a food's stored amounts, in table order, each in its own unit; `filled` marks them as not typed here. */
export const rowsFromMicro = (m: Micro | undefined, filled: boolean): AmountRow[] =>
  NUTRIENT_KEYS.flatMap(key => (m?.[key] !== undefined ? [{ key, amount: String(m[key]), unit: MICRO_UNIT[key], ...(filled ? { filled: true } : {}) }] : []));

/** The first nutrient without a row, for "+ Add a nutrient". */
export const nextFreeKey = (rows: AmountRow[]): NutrientKey | undefined => nextFreePickerKey(rows.map(r => r.key));

/** The rows a save would keep: when calories no longer match the ones the filled rows came with, the untouched filled rows go and `cleared` says so. */
export function liveRows(rows: AmountRow[], kcal: number, kcalFrom: number | undefined): { rows: AmountRow[]; cleared: boolean } {
  if (kcalFrom === undefined || kcal === kcalFrom) return { rows, cleared: false };
  const keep = rows.filter(r => !r.filled);
  return { rows: keep, cleared: keep.length < rows.length };
}

/** The `Micro` for these rows, each amount converted to the nutrient's table unit (1 mg of B12 is 1000 mcg), and one line for every row left out: an empty or zero amount is skipped silently,
 *  a second row for the same nutrient and an amount over the cap are named. */
export function microOfRows(rows: AmountRow[]): { micro: Micro | undefined; left: string[] } {
  const out: Record<string, number> = {}; const left: string[] = [];
  for (const r of rows) {
    const a = Number(r.amount);
    if (r.amount.trim() === '' || !(a > 0)) continue;
    if (r.key in out) { left.push(`${nutrientLabel(r.key)} is listed twice; only the first is kept.`); continue; }
    const v = (a * MCG_PER[r.unit]) / MCG_PER[MICRO_UNIT[r.key]];
    if (v > MICRO_MAX[r.key]) { left.push(`${nutrientLabel(r.key)} ${r.amount} ${r.unit} is far above any food; left out.`); continue; }
    out[r.key] = v;
  }
  return { micro: cleanMicro(out) ?? undefined, left };
}
