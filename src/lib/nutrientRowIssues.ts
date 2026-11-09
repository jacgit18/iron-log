import type { NutrientKey, NutrientUnit } from '../shared/nutrientKeys.js';
import { limitOf } from './nutrientLimits.js';

/* ---------- What the supplement sheet tells a person about rows that will not be saved ----------
   The store keeps one row per nutrient and unit (`nutrientsOf`), so a second one is dropped on save; say so while the rows are on screen. */

export interface NutrientRowDraft { key: NutrientKey; amount: string; unit: NutrientUnit }

/** One line per nutrient and unit listed more than once with an amount: "Zinc in mg is listed twice; only the first is kept." */
export function duplicateRowNotes(rows: NutrientRowDraft[]): string[] {
  const seen = new Set<string>(); const said = new Set<string>(); const out: string[] = [];
  for (const r of rows) {
    if (!(Number(r.amount) > 0)) continue;
    const id = `${r.key}/${r.unit}`;
    if (seen.has(id) && !said.has(id)) { said.add(id); out.push(`${limitOf(r.key)?.label ?? r.key} in ${r.unit} is listed twice; only the first is kept.`); }
    seen.add(id);
  }
  return out;
}
