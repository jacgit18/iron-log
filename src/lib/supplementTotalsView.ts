import type { DietEntry, SupplementItem, Taken } from '../types.ts';
import { limitOf } from './nutrientLimits.js';
import { foodCoverage, limitStatus, overLimit, supplementNutrientTotals, targetPosition, targetTotals } from './supplementNutrients.js';
import { targetOf } from './nutrientTargets.js';
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
  /** What the total is made of when food is part of the picture: "Supplements 200 mg, food 80 mg", or "Food 80 mg is not added: this limit counts supplements only." Empty with no food. */
  foodLine: string;
  /** "Magnesium 200 mg" per product that adds to it, biggest first. */
  products: string[];
  recommendedText: string;
  scopeNote: string;
  /** Rows a product listed that could not be added, with the reason. */
  notAdded: string[];
}
/** A nutrient with no upper limit (ADR 108): a share of the recommended amount in words, a neutral bar, never a status that warns. */
export interface TargetRow {
  key: string;
  label: string;
  figure: string;
  /** Bar width, 0 to 100, of the highest recommended amount (sodium: of the level to stay under). */
  percent: number;
  statusText: string;
  foodLine: string;
  products: string[];
  recommendedText: string;
  scopeNote: string;
  notAdded: string[];
}
export interface TotalsView {
  rows: TotalRow[];
  /** The nutrients with no upper limit that the day has data for (the sheet's "No upper limit" section). */
  targets: TargetRow[];
  /** A scheduled supplement lists what is in it, or an eaten food that day lists vitamins or minerals (false shows the empty state). */
  hasData: boolean;
  /** Nothing is counted on this basis (nothing ticked, no food with data) although data exists. */
  noneCounted: boolean;
  /** "Food: 3 of 5 eaten foods had vitamin or mineral data." Empty when no food was eaten that day. */
  coverage: string;
}

/** 1250 becomes "1,250"; at most two decimals, none when whole. */
export const fmtAmount = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Why food is shown beside a row but not added to it, by what the limit counts (the same words as the limits table's scope). */
const NOT_ADDED: Record<'supplements' | 'form', string> = { supplements: 'this limit counts supplements only', form: 'this limit counts one form of the nutrient, which a food label does not separate' };

/** The coverage line: how many of a day's eaten foods listed vitamins or minerals. A food without data adds nothing, so say so. */
export function coverageText(eaten: readonly DietEntry[]): string {
  const c = foodCoverage(eaten);
  if (c.eaten === 0) return '';
  return `Food: ${c.withData} of ${c.eaten} eaten ${c.eaten === 1 ? 'food' : 'foods'} had vitamin or mineral data.${c.withData < c.eaten ? ' Foods without data add nothing, so food totals can be low.' : ''}`;
}

export const hasFoodData = (eaten: readonly DietEntry[]): boolean => foodCoverage(eaten).withData > 0;

/** Said beside every recommended amount and the day's warning line (legal readiness note 2026-11-09, item 5). */
export const GENERAL_INFO = 'General information, not medical advice.';

const rangeText = (min: number, max: number): string => (min === max ? fmtAmount(min) : `${fmtAmount(min)} to ${fmtAmount(max)}`);

function targetRows(items: SupplementItem[], taken: Taken, date: string, basis: TotalsBasis, eaten: readonly DietEntry[]): TargetRow[] {
  return targetTotals(items, taken, date, basis, eaten).map((t): TargetRow => {
    const target = targetOf(t.key)!;
    const { min, max } = target.recommended;
    const ref = target.stayUnder ?? max; // the bar is read against the level to stay under (sodium) or the highest recommended amount
    const pct = Math.round((t.total / ref) * 100);
    let statusText: string;
    if (target.stayUnder !== undefined) statusText = t.total > target.stayUnder ? `Above the ${fmtAmount(target.stayUnder)} ${t.unit} level to stay under by ${fmtAmount(Math.round((t.total - target.stayUnder) * 1000) / 1000)} ${t.unit}` : `${pct}% of the ${fmtAmount(target.stayUnder)} ${t.unit} level to stay under`;
    else if (min === max) statusText = `${pct}% of the recommended amount`;
    else statusText = { below: 'Below the recommended range', within: 'Within the recommended range', above: 'Above the recommended range' }[targetPosition(t)];
    const recommendedText = target.stayUnder !== undefined
      ? `${target.basis === 'AI' ? 'Adequate Intake' : 'Recommended'} ${rangeText(min, max)} ${t.unit} a day (${target.recommendedNote}). Level to stay under: ${fmtAmount(target.stayUnder)} ${t.unit} a day. ${GENERAL_INFO}`
      : `Recommended ${rangeText(min, max)} ${t.unit} a day (${target.recommendedNote}). ${GENERAL_INFO}`;
    return {
      key: t.key, label: target.label, figure: `${fmtAmount(t.total)} ${t.unit}`, percent: Math.max(0, Math.min(100, pct)), statusText,
      foodLine: t.fromFood > 0 ? `Supplements ${fmtAmount(t.fromSupplements)} ${t.unit}, food ${fmtAmount(t.fromFood)} ${t.unit}.` : '',
      products: t.products.map(p => `${p.name} ${fmtAmount(p.amount)} ${t.unit}`), recommendedText, scopeNote: target.scopeNote,
      notAdded: t.notAdded.map(n => `${n.name}: ${fmtAmount(n.amount)} ${n.unit} not added. ${n.reason}`),
    };
  });
}

export function totalsView(items: SupplementItem[], taken: Taken, date: string, basis: TotalsBasis, eaten: readonly DietEntry[] = []): TotalsView {
  const hasData = scheduled(items).some(i => (i.nutrients || []).length > 0) || hasFoodData(eaten);
  const rows = supplementNutrientTotals(items, taken, date, basis, eaten).map((t): TotalRow => {
    const limit = limitOf(t.key)!;
    const s = limitStatus(t);
    const rec = limit.recommended;
    return {
      key: t.key,
      label: limit.label,
      figure: `${fmtAmount(t.total)} ${t.unit}${t.fromFood > 0 && !t.foodCounted ? ' from supplements' : ''}`, // food shown beside the row but not added: say what the figure is, so 0 is not read as none
      limitText: `Limit ${fmtAmount(limit.upper)} ${t.unit}`,
      percent: Math.min(100, s.percent),
      status: s.status,
      statusText: s.status === 'over' ? `Over the limit by ${fmtAmount(s.over)} ${t.unit}` : s.status === 'close' ? `Close to the limit (${s.percent}%)` : `${s.percent}% of the limit`,
      foodLine: t.fromFood <= 0 ? '' : t.foodCounted ? `Supplements ${fmtAmount(t.fromSupplements)} ${t.unit}, food ${fmtAmount(t.fromFood)} ${t.unit}.` : `Food ${fmtAmount(t.fromFood)} ${t.unit} is not added: ${NOT_ADDED[limit.scope === 'supplements' ? 'supplements' : 'form']}.`,
      products: t.products.map(p => `${p.name} ${fmtAmount(p.amount)} ${t.unit}`),
      recommendedText: `Recommended ${rangeText(rec.min, rec.max)} ${t.unit} a day (${limit.recommendedNote}). ${GENERAL_INFO}`,
      scopeNote: limit.scopeNote,
      notAdded: t.notAdded.map(n => `${n.name}: ${fmtAmount(n.amount)} ${n.unit} not added. ${n.reason}`),
    };
  });
  const targets = targetRows(items, taken, date, basis, eaten);
  return { rows, targets, hasData, noneCounted: hasData && rows.length === 0 && targets.length === 0, coverage: coverageText(eaten) };
}

/** The line under a day's supplements when a total passes its limit; empty when none does or no data exists. It names no figure: the limit a person has depends on age (calcium, phosphorus), which only the sheet explains. */
export function limitWarning(items: SupplementItem[], taken: Taken, date: string, eaten: readonly DietEntry[] = []): string {
  const over = overLimit(supplementNutrientTotals(items, taken, date, 'taken', eaten)).map(t => limitOf(t.key)!.label);
  return over.length ? `Over an upper limit today: ${over.join(', ')}. Totals shows what each limit counts. ${GENERAL_INFO}` : '';
}
