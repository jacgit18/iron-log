import type { Boost, Supplements } from '../types.ts';
/* ---------- Supplements: the water log ----------
   supplements doc (the supplement library and schedule are in supplements.js): {waterGoal (oz, used when the goal is fixed or no weight is logged), waterMode: 'weight'|'fixed', boost: {"YYYY-MM-DD": {hot: true, mins: training minutes}} (extra ounces for a hot day and for training), water: {"YYYY-MM-DD": [oz, oz, ...]}}. Each drink is kept on its own so the last
   one can be taken back; cups are just ounces / 8. */

import { normItems, normTaken } from './supplements.js';
import { validOz, validGoal } from './validate.js';

export const CUP_OZ = 8;
export const DEFAULT_GOAL_OZ = 64; // 8 cups
// Common containers, in ounces. A 500 mL bottle is 16.9 oz.
export const BOTTLES = [
  { oz: 8, label: 'Cup' },
  { oz: 12, label: 'Can' },
  { oz: 16.9, label: '500 mL bottle' },
  { oz: 20, label: 'Sports bottle' },
  { oz: 22, label: 'Bottle' },
  { oz: 24, label: 'Large bottle' },
  { oz: 32, label: 'Quart or Nalgene' },
  { oz: 40, label: 'Insulated, 40 oz' },
  { oz: 64, label: 'Half gallon' },
];

export const OZ_PER_LB = 0.5; // the usual rule of thumb: half your body weight in pounds, in ounces
export const HOT_OZ = 16; // extra for a hot day
export const TRAIN_OZ_PER_30 = 12; // extra per 30 minutes of training
export const MAX_TRAIN_MIN = 600;
const r1 = (n: number) => Math.round(n * 10) / 10;
export const fmtOz = (n: number) => `${r1(n)}`;
export const cupsOf = (oz: number) => r1(oz / CUP_OZ);
export const sumOz = (list: number[] | undefined) => r1((list || []).reduce((a, n) => a + n, 0));
export { validOz, validGoal };

export function normSupplements(d: any): Supplements {
  const out: Supplements = { waterGoal: DEFAULT_GOAL_OZ, waterMode: 'weight', water: {}, boost: {}, items: [], taken: {} };
  if (!d || typeof d !== 'object') return out;
  if (validGoal(Number(d.waterGoal))) out.waterGoal = r1(Number(d.waterGoal));
  if (d.waterMode === 'fixed') out.waterMode = 'fixed';
  out.items = normItems(d); out.taken = normTaken(d.taken);
  if (d.water && typeof d.water === 'object') {
    Object.keys(d.water).forEach(k => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !Array.isArray(d.water[k])) return;
      const l = d.water[k].map(Number).filter(validOz).map(r1);
      if (l.length) out.water[k] = l;
    });
  }
  if (d.boost && typeof d.boost === 'object') {
    Object.keys(d.boost).forEach(k => {
      const b = d.boost[k]; if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !b || typeof b !== 'object') return;
      const mins = Math.round(Number(b.mins)); const e: Boost = {};
      if (b.hot === true) e.hot = true;
      if (Number.isFinite(mins) && mins > 0 && mins <= MAX_TRAIN_MIN) e.mins = mins;
      if (Object.keys(e).length) out.boost[k] = e;
    });
  }
  return out;
}

// Extra ounces for a day: a hot-day top-up plus a top-up for the minutes trained.
export function boostOz(b: Boost | null | undefined) {
  if (!b) return { hot: 0, train: 0, oz: 0 };
  const hot = b.hot ? HOT_OZ : 0; const train = r1((b.mins || 0) / 30 * TRAIN_OZ_PER_30);
  return { hot, train, oz: r1(hot + train) };
}

// The last n days ending at `end` (a Date), oldest first: [{d: 'YYYY-MM-DD', oz}]
export function lastDays(water: Record<string, number[]>, end: Date, n: number, ymd: (d: Date) => string) {
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (n - 1 - i));
    const d = ymd(x); return { d, date: x, oz: sumOz(water[d]) };
  });
}

// The goal for a date. In 'weight' mode it is half the latest body weight logged on or before that date (or, with none
// before it, the earliest logged); with no weight logged it falls back to the fixed goal.
export function goalFor(supp: Supplements, body: { d: string; w: number }[] | null | undefined, date: string) {
  const base = baseGoal(supp, body, date); const x = boostOz((supp.boost || {})[date]);
  return { ...base, baseOz: base.oz, extra: x, oz: r1(base.oz + x.oz) };
}

function baseGoal(supp: Supplements, body: { d: string; w: number }[] | null | undefined, date: string) {
  const L = (body || []).filter(e => e && Number(e.w) > 0).sort((a, b) => a.d.localeCompare(b.d));
  if (supp.waterMode === 'weight' && L.length) {
    const e = [...L].reverse().find(x => x.d <= date) || L[0];
    return { oz: validGoal(Number(e.w) * OZ_PER_LB) ? r1(Number(e.w) * OZ_PER_LB) : supp.waterGoal, source: 'weight', lb: Number(e.w) };
  }
  return { oz: supp.waterGoal, source: supp.waterMode === 'weight' ? 'default' : 'fixed', lb: null as number | null };
}
