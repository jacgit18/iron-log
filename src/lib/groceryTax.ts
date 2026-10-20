import { MAX_TAX } from '../shared/grocery.js';

/* ---------- Sales tax on a store's groceries ----------
   A store's tax is a rate in thousandths of a percent (8.875% is 8875). Tax is worked out once on a store's whole subtotal for the month and
   rounded to the cent, so subtotal + tax is what the receipt says (rounding each line instead drifts by a few cents). Pure; whole cents. */

/** The tax on `subtotal` cents at `rate` (thousandths of a percent), rounded to the cent; none without a rate. */
export const taxCents = (subtotal: number, rate?: number): number => (rate && subtotal > 0 ? Math.round((subtotal * rate) / 100_000) : 0);

/** A rate as typed back to the user: 8875 is "8.875". */
export const taxText = (rate: number | undefined): string => (rate ? String(rate / 1000) : '');

/** A percent typed as "8.875" or "8,875 %" in thousandths of a percent, or null when it is not a rate from 0.001 to 30 with at most 3 decimals. */
export function parseTaxPercent(text: string): number | null {
  const t = text.trim().replace('%', '').replace(',', '.').trim();
  if (!/^\d{1,2}(\.\d{1,3})?$/.test(t)) return null;
  const rate = Math.round(Number(t) * 1000);
  return rate >= 1 && rate <= MAX_TAX ? rate : null;
}

/** Add each store's tax to its subtotal: `by` maps a store to its subtotal. */
export function withTax(by: Record<string, number>, taxes?: Record<string, number>): number {
  return Object.entries(by).reduce((a, [store, sub]) => a + sub + taxCents(sub, taxes?.[store]), 0);
}
