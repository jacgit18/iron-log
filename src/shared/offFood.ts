// Open Food Facts product (brief barcode-coverage): turns one answer of its product API into the same FoodHit a USDA search gives, per 100 g. Pure, shared by the
// server (which asks Open Food Facts after USDA has no such code). The data is crowd-sourced, so the hit carries source 'off' and the app shows a "check the label" note.
import { offMicro, withMicro } from './foodMicro.js';
import { MAX_GRAMS, type FoodHit } from './foods.js';

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
// Open Food Facts writes some numbers as text ("28"), so a numeric string counts; a negative, blank or non-number does not.
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;
const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, max) : undefined);

/** The product in an Open Food Facts answer for `gtin` (14 digits) as a FoodHit, or null when it has no name, no calories or no protein (like a USDA row without them). Never throws. */
export function offHit(json: unknown, gtin: string): FoodHit | null {
  const root = obj(json);
  const p = root?.status === 1 ? obj(root.product) : null;
  if (!p) return null;
  const name = text(p.product_name, 80);
  const n = obj(p.nutriments);
  const kcal = num(n?.['energy-kcal_100g']), protein = num(n?.proteins_100g);
  if (!name || kcal === null || protein === null || kcal <= 0) return null;
  const c = num(n?.carbohydrates_100g), f = num(n?.fat_100g);
  const size = num(p.serving_quantity);
  const brand = text(typeof p.brands === 'string' ? p.brands.split(',')[0] : undefined, 60);
  const id = Number(gtin);
  if (!Number.isSafeInteger(id)) return null;
  return {
    id, name, ...(brand ? { brand } : {}), kcal: Math.round(kcal), p: round1(protein),
    ...(c !== null ? { c: round1(c) } : {}), ...(f !== null ? { f: round1(f) } : {}),
    ...(size !== null && size > 0 && size <= MAX_GRAMS ? { serving: round1(size) } : {}),
    source: 'off',
    ...withMicro(offMicro(n)),
  };
}
