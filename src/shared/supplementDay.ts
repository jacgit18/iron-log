import type { Boost } from '../types.ts';
import { validOz } from './validate.js';

/* ---------- One day of the supplements document ----------
   The water drinks, the hot-day / training boost and the supplements ticked off on one day. Framework-free, so the
   client and the API share the cleaning rules (ADR 015). Amounts are ounces. */

export const MAX_TRAIN_MIN = 600;
export const r1 = (n: number) => Math.round(n * 10) / 10;

// Drinks above 0 and up to 200 oz, rounded to one decimal. Anything else is dropped.
export const normWaterDay = (list: unknown): number[] => (Array.isArray(list) ? list.map(Number).filter(validOz).map(r1) : []);

// {hot: true, mins: training minutes}, or null when neither is set.
export function normBoost(b: unknown): Boost | null {
  if (!b || typeof b !== 'object') return null;
  const { hot, mins } = b as Record<string, unknown>;
  const m = Math.round(Number(mins)); const e: Boost = {};
  if (hot === true) e.hot = true;
  if (Number.isFinite(m) && m > 0 && m <= MAX_TRAIN_MIN) e.mins = m;
  return Object.keys(e).length ? e : null;
}

// {<supplement id>: true} for the ones ticked off that day.
export function normTakenDay(t: unknown): Record<string, true> {
  if (!t || typeof t !== 'object') return {};
  const o = t as Record<string, unknown>;
  return Object.fromEntries(Object.keys(o).filter(id => o[id]).map(id => [id, true as const]));
}
