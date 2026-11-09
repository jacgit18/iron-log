import type { SupplementItem, Taken } from '../types.ts';
import { limitOf } from './nutrientLimits.js';
import { limitStatus, overLimit, supplementNutrientTotals } from './supplementNutrients.js';
import type { LimitStatus, TotalsBasis } from './supplementNutrients.js';
import { scheduled } from './supplements.js';

/* ---------- What the Totals sheet and the day's warning line say ----------
   Pure: the sheet only draws these rows. The numbers come from `supplementNutrients.ts`, the limits and their sources from `nutrientLimits.ts`.
   Status is always in words as well as colour (a bar alone says nothing to a screen reader). */

export interface TotalRow {
  key: string;
  label: string;
  /** The total with its unit, "350 mg". */
  figure: string;
  /** "Limit 350 mg". */
  limitText: string;
  /** Bar width, 0 to 100 (an over-the-limit total fills the bar). */
  percent: number;
  status: LimitStatus;
  statusText: string;
  /** "Magnesium 200 mg" per product that adds to it, biggest first. */
  products: string[];
  recommendedText: string;
  scopeNote: string;
  /** Rows a product listed that could not be added, with the reason. */
  notAdded: string[];
}
export interface TotalsView {
  rows: TotalRow[];
  /** At least one scheduled supplement lists what is in it (false shows the empty state). */
  hasData: boolean;
  /** Nothing is counted on this basis (nothing ticked) although data exists. */
  noneCounted: boolean;
}

/** 1250 becomes "1,250"; at most two decimals, none when whole. */
export const fmtAmount = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function totalsView(items: SupplementItem[], taken: Taken, date: string, basis: TotalsBasis): TotalsView {
  const hasData = scheduled(items).some(i => (i.nutrients || []).length > 0);
  const rows = supplementNutrientTotals(items, taken, date, basis).map((t): TotalRow => {
    const limit = limitOf(t.key)!;
    const s = limitStatus(t);
    const rec = limit.recommended;
    return {
      key: t.key,
      label: limit.label,
      figure: `${fmtAmount(t.total)} ${t.unit}`,
      limitText: `Limit ${fmtAmount(limit.upper)} ${t.unit}`,
      percent: Math.min(100, s.percent),
      status: s.status,
      statusText: s.status === 'over' ? `Over the limit by ${fmtAmount(s.over)} ${t.unit}` : s.status === 'close' ? `Close to the limit (${s.percent}%)` : `${s.percent}% of the limit`,
      products: t.products.map(p => `${p.name} ${fmtAmount(p.amount)} ${t.unit}`),
      recommendedText: `Recommended ${rec.min === rec.max ? fmtAmount(rec.min) : `${fmtAmount(rec.min)} to ${fmtAmount(rec.max)}`} ${t.unit} a day (${limit.recommendedNote})`,
      scopeNote: limit.scopeNote,
      notAdded: t.notAdded.map(n => `${n.name}: ${fmtAmount(n.amount)} ${n.unit} not added. ${n.reason}`),
    };
  });
  return { rows, hasData, noneCounted: hasData && rows.length === 0 };
}

/** The line under a day's supplements when a total passes its limit; empty when none does or no data exists. It names no figure: the limit a person has depends on age (calcium, phosphorus), which only the sheet explains. */
export function limitWarning(items: SupplementItem[], taken: Taken, date: string): string {
  const over = overLimit(supplementNutrientTotals(items, taken, date, 'taken')).map(t => limitOf(t.key)!.label);
  return over.length ? `Over an upper limit today: ${over.join(', ')}. Totals shows what each limit counts.` : '';
}
