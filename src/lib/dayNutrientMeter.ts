import type { LimitStatus } from './supplementNutrients.js';
import type { TotalRow, TotalsView } from './supplementTotalsView.js';

/* ---------- The vitamin and mineral lines under a day's Supplements meter (brief vitamin-mineral-day-meter, layout B) ----------
   Pure: it reads the rows the Totals sheet draws (`totalsView`), so the meter and the sheet never disagree on a figure, a limit or what food adds. Only nutrients with an upper limit are
   in those rows; the five without one (ADR 108) never headline and never warn. A closed line names the two nearest their limits, an open list shows up to five as thin bars. */

export const SUB_LIMIT = 5;
export const CLOSED_NAMES = 2;

export interface MeterItem {
  key: string;
  label: string;
  /** What is drawn: "62%", or "Over" when past the limit. */
  text: string;
  status: LimitStatus;
  /** Bar width, 0 to 100. */
  percent: number;
  /** The sheet's own words for this row, for the bar's accessible name. */
  name: string;
}
export type DayMeterView =
  | { kind: 'rows'; top: MeterItem[]; subs: MeterItem[]; tracked: number; hidden: number; closed: string }
  | { kind: 'none' };

const item = (r: TotalRow): MeterItem => ({
  key: r.key, label: r.label, status: r.status, percent: r.percent,
  text: r.status === 'over' ? 'Over' : `${r.share}%`,
  name: `${r.label}: ${r.figure}. ${r.statusText}. ${r.limitText}`,
});

/** `null` draws nothing (no nutrient data, or only nutrients without a limit); `none` is "Nothing ticked yet" (data exists but nothing is counted on this day); otherwise the nearest limits. */
export function dayNutrientMeter(v: TotalsView): DayMeterView | null {
  if (!v.hasData) return null;
  if (v.noneCounted) return { kind: 'none' };
  if (v.rows.length === 0) return null;
  const ranked = [...v.rows].sort((a, b) => Number(b.status === 'over') - Number(a.status === 'over') || b.share - a.share).map(item); // over first (a total a hair past its limit rounds to 100%, level with one exactly at it), then by share; a tie keeps the limits table's order (the sort is stable)
  const top = ranked.slice(0, CLOSED_NAMES);
  return { kind: 'rows', top, subs: ranked.slice(0, SUB_LIMIT), tracked: ranked.length, hidden: Math.max(0, ranked.length - SUB_LIMIT), closed: top.map(t => `${t.label} ${t.status === 'over' ? 'over' : t.text}`).join(' · ') };
}

/** Whether the Supplements section keeps its own Totals button (brief nutrition-manage-cleanup). `hasTotals` is what the button needed before: something scheduled, or a food eaten with vitamin or mineral data.
 *  The meter's own "Open Totals" / "All N in Totals" then reaches the same sheet, so the section's button is hidden while the meter draws its rows. The meter's "nothing ticked yet" line and a day with no meter have no way in,
 *  so the button stays there: Totals is reachable on every day it was. */
export function sectionTotalsVisible(hasTotals: boolean, meter: DayMeterView | null): boolean {
  return hasTotals && meter?.kind !== 'rows';
}
