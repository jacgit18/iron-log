import type { IngredientRow, IngredientStatus } from './supplementIngredients.js';

/* ---------- The active-ingredient line under a day's Supplements meter (brief ingredient-day-bars, layout A) ----------
   Pure: it reads the rows the Totals sheet draws (`ingredientRows`), so the line and the sheet never disagree. Only an ingredient you set a limit for has a bar (a bar needs a limit to measure
   against); one without a limit is left to the Totals sheet. A closed line names the two nearest their limits, an open list shows up to five as thin bars. */

export const ING_SUB_LIMIT = 5;
export const ING_CLOSED_NAMES = 2;

export interface IngredientMeterItem {
  key: string;
  label: string;
  /** What is drawn: "62%", "Met" for a target reached, "Over" past a cap. */
  text: string;
  status: IngredientStatus;
  /** Bar width, 0 to 100. */
  percent: number;
  /** The Totals sheet's own words for this row, for the bar's accessible name. */
  name: string;
}
export type DayIngredientMeterView =
  | { kind: 'rows'; top: IngredientMeterItem[]; subs: IngredientMeterItem[]; tracked: number; hidden: number }
  | { kind: 'none' };

const item = (r: IngredientRow): IngredientMeterItem => ({
  key: r.key, label: r.label, status: r.status, percent: r.percent,
  text: r.status === 'over' ? 'Over' : r.status === 'met' ? 'Met' : `${r.percent}%`,
  name: `${r.label}: ${r.figure}. ${r.statusText}. ${r.limitText}`,
});

/** `null` draws nothing (no limit set on anything); `none` is "nothing ticked yet" (limits exist but none of their ingredients is counted on this day); otherwise the nearest limits. */
export function dayIngredientMeter(rows: IngredientRow[]): DayIngredientMeterView | null {
  const limited = rows.filter(r => r.limit);
  if (limited.length === 0) return null;
  if (limited.every(r => r.total === 0)) return { kind: 'none' };
  const ranked = [...limited].sort((a, b) => Number(b.status === 'over') - Number(a.status === 'over') || b.percent - a.percent).map(item); // over first, then by share; a tie keeps the Totals order (stable sort)
  return { kind: 'rows', top: ranked.slice(0, ING_CLOSED_NAMES), subs: ranked.slice(0, ING_SUB_LIMIT), tracked: ranked.length, hidden: Math.max(0, ranked.length - ING_SUB_LIMIT) };
}

/** The closed line's words: "Omega-3 62% · EPA Met", "Omega-3 over". */
export const ingredientClosedLine = (top: IngredientMeterItem[]): string => top.map(t => `${t.label} ${t.status === 'over' ? 'over' : t.text}`).join(' · ');
