// Barcode scan (brief barcode-scan): turns a code read by the phone into the one 14-digit form USDA FoodData Central stores its product codes in, and picks
// the one product whose own code equals it from a USDA answer. Pure, shared by the server (which asks USDA) and the app (which reads the camera). Nothing is stored.
import { parseFoods, type FoodHit } from './foods.js';

/** Lengths of the product codes a grocery item carries: EAN-8, UPC-A, EAN-13, GTIN-14. */
const LENGTHS = [8, 12, 13, 14];

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** The check digit a code of this many digits should end with (GS1 rule: weights 3, 1, 3, 1 from the digit left of the check digit). */
function checkDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

/** The code as 14 digits (zero padded on the left, how USDA stores it), or null when it is not 8, 12, 13 or 14 digits or its check digit is wrong. */
export function cleanGtin(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d+$/.test(v) || !LENGTHS.includes(v.length)) return null;
  if (checkDigit(v.slice(0, -1)) !== Number(v.slice(-1))) return null;
  return v.padStart(14, '0');
}

/** A UPC-E code (8 digits, the short form on small packs) written out as the 12-digit UPC-A that USDA holds; null when it is not UPC-E shaped. Check it with `cleanGtin` afterwards. */
export function upcEToUpcA(v: string): string | null {
  if (!/^[01]\d{7}$/.test(v)) return null;
  const ns = v[0]!, d = v.slice(1, 7), check = v[7]!, last = d[5]!;
  if (last === '0' || last === '1' || last === '2') return `${ns}${d.slice(0, 2)}${last}0000${d.slice(2, 5)}${check}`;
  if (last === '3') return `${ns}${d.slice(0, 3)}00000${d.slice(3, 5)}${check}`;
  if (last === '4') return `${ns}${d.slice(0, 4)}00000${d[4]}${check}`;
  return `${ns}${d.slice(0, 5)}0000${last}${check}`;
}

/** What the camera read, as the canonical 14 digits: the reader's own format picks UPC-E expansion. Null when it is not a usable product code. */
export function gtinFromScan(raw: unknown, format?: string): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim();
  if (format === 'upc_e') { const a = upcEToUpcA(code); return a ? cleanGtin(a) : null; }
  return cleanGtin(code);
}

/** The product in a USDA answer whose own code is exactly `gtin` (14 digits), or null. A food that only mentions the digits in its text never matches, and a product with no calories or protein is dropped like in a typed search. */
export function hitForGtin(json: unknown, gtin: string): FoodHit | null {
  const foods = obj(json)?.foods;
  if (!Array.isArray(foods)) return null;
  const same = foods.filter(f => {
    const code = obj(f)?.gtinUpc;
    return typeof code === 'string' && /^\d{8,14}$/.test(code) && code.padStart(14, '0') === gtin;
  });
  return parseFoods({ foods: same })[0] ?? null;
}

/** What a scan of a supplement bottle needs from a product: its name and brand, never its nutrition (a vitamin has no calories to speak of; brief supplement-barcode-search). */
export interface ProductName { name: string; brand?: string }

const clean = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, max) : undefined);

/** The name and brand of the product in a USDA answer whose own code is exactly `gtin` (14 digits), or null. Unlike `hitForGtin` it does not need calories or protein. */
export function nameForGtin(json: unknown, gtin: string): ProductName | null {
  const foods = obj(json)?.foods;
  if (!Array.isArray(foods)) return null;
  for (const f of foods) {
    const o = obj(f);
    const code = o?.gtinUpc;
    if (!o || typeof code !== 'string' || !/^\d{8,14}$/.test(code) || code.padStart(14, '0') !== gtin) continue;
    const name = clean(o.description, 100);
    if (!name) continue;
    const brand = clean(o.brandName, 60) ?? clean(o.brandOwner, 60);
    return { name, ...(brand ? { brand } : {}) };
  }
  return null;
}
