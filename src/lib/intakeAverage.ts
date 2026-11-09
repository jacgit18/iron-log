import type { DietEntry, SupplementItem, Taken } from '../types.ts';
import { entriesOn, shiftDay } from './dietLog.js';
import { rollingAverage } from './intakeChecks.js';
import { supplementNutrientTotals, targetTotals } from './supplementNutrients.js';
import type { TotalsBasis } from './supplementNutrients.js';

/* ---------- The 7 days ending on the viewed day, averaged per nutrient (brief intake-target-and-safety-checks, PR 2) ----------
   For each day the same totals the sheet shows (what the limit counts, for the nutrients with a limit; supplements and food in full for the five without), then the average of the days that
   have data, with how many that was. A day with no row for the nutrient is a day without data, so it is skipped and said so, never counted as zero. Pure. */

export interface AverageEntry { average: number; days: number }
export interface WeekAverages { limits: Map<string, AverageEntry>; targets: Map<string, AverageEntry> }

export const AVERAGE_DAYS = 7;

export function weekAverages(items: SupplementItem[], taken: Taken, endDay: string, basis: TotalsBasis, diet: DietEntry[]): WeekAverages {
  const perKey = { limits: new Map<string, (number | undefined)[]>(), targets: new Map<string, (number | undefined)[]>() };
  const days: string[] = [];
  for (let i = AVERAGE_DAYS - 1; i >= 0; i--) days.push(shiftDay(endDay, -i)); // oldest first
  days.forEach((d, at) => {
    const eaten = entriesOn(diet, d);
    const put = (m: Map<string, (number | undefined)[]>, key: string, total: number) => { const a = m.get(key) ?? new Array<number | undefined>(AVERAGE_DAYS).fill(undefined); a[at] = total; m.set(key, a); };
    supplementNutrientTotals(items, taken, d, basis, eaten).forEach(t => put(perKey.limits, t.key, t.total));
    targetTotals(items, taken, d, basis, eaten).forEach(t => put(perKey.targets, t.key, t.total));
  });
  const reduce = (m: Map<string, (number | undefined)[]>) => { const out = new Map<string, AverageEntry>(); m.forEach((a, k) => { const r = rollingAverage(a, AVERAGE_DAYS); if (r) out.set(k, r); }); return out; };
  return { limits: reduce(perKey.limits), targets: reduce(perKey.targets) };
}
