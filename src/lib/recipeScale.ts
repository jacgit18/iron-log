import { MAX_AMOUNT } from '../shared/recipes.js';

/* ---------- Scaling a recipe's amounts with its servings (brief recipe-servings-scaling) ----------
   Amounts are free text ("1 ½ cups", "2-3 cloves", "1 (14 oz) can"). Only the leading quantity is read and scaled; the rest of the text is
   kept as it is. Text that does not start with a number ("pinch", "to taste") is left as written. Pure, so every shape is a node test. */

const GLYPH: Record<string, number> = { '¼': 1 / 4, '½': 1 / 2, '¾': 3 / 4, '⅐': 1 / 7, '⅑': 1 / 9, '⅒': 1 / 10, '⅓': 1 / 3, '⅔': 2 / 3, '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8 };
// What a fraction is written as, nearest first to the value: eighths, thirds and sixths.
const WRITE: [number, string][] = [[0, ''], [1 / 8, '⅛'], [1 / 6, '⅙'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [5 / 6, '⅚'], [7 / 8, '⅞'], [1, '']];

const G = '¼-¾⅐-⅞';
// One number: "1½" or "1 ½", "½", "1 1/2" or "1-1/2", "1/2", "1.5", "2".
const NUMBER = new RegExp(`(\\d+)\\s*([${G}])|([${G}])|(\\d+)[\\s-]+(\\d+)/(\\d+)|(\\d+)/(\\d+)|(\\d+(?:\\.\\d+)?)`, 'y');
const COMPOUND = new RegExp(`(?:\\b(?:plus|and|or)\\b|[+/&])\\s*[\\d${G}]`, 'i');
const RANGE = /\s*(?:[-–—]|\s+to\s+)\s*/y;

function readNumber(s: string, at: number): { value: number; end: number } | null {
  NUMBER.lastIndex = at;
  const m = NUMBER.exec(s);
  if (!m) return null;
  const end = NUMBER.lastIndex;
  if (m[2]) return { value: Number(m[1]) + GLYPH[m[2]]!, end };
  if (m[3]) return { value: GLYPH[m[3]]!, end };
  if (m[4]) return Number(m[6]) ? { value: Number(m[4]) + Number(m[5]) / Number(m[6]), end } : null;
  if (m[7]) return Number(m[8]) ? { value: Number(m[7]) / Number(m[8]), end } : null;
  return { value: Number(m[9]), end };
}

/** A quantity as cooking text: whole numbers stay whole, fractions are the nearest eighth, third or sixth ("1½", "⅔"), a tiny one keeps two decimals. */
export function writeQuantity(v: number): string {
  if (!(v > 0)) return '0';
  if (v < 1 / 16) return String(Math.round(v * 100) / 100);
  if (v >= 20) return String(Math.round(v));
  const whole = Math.floor(v), frac = v - whole;
  const [f, glyph] = WRITE.reduce((best, c) => (Math.abs(c[0] - frac) < Math.abs(best[0] - frac) ? c : best));
  const n = f === 1 ? whole + 1 : whole;
  if (n === 0 && !glyph) return String(Math.round(v * 100) / 100); // too small to be an eighth
  return n === 0 ? glyph : `${n}${glyph}`;
}

export interface Scaled { text: string; scaled: boolean }

/** An amount multiplied by `factor`. `scaled` is false (and the text unchanged) when it does not start with a number, when the factor is not
 *  a positive number, or when the result would pass the amount limit. A factor of 1 returns the text exactly as it was. */
export function scaleAmount(amt: string, factor: number): Scaled {
  const text = amt.trim();
  if (!text || !(factor > 0) || !Number.isFinite(factor)) return { text: amt, scaled: false };
  const first = readNumber(text, 0);
  if (!first) return { text: amt, scaled: false };
  if (factor === 1) return { text: amt, scaled: true };
  let out = writeQuantity(first.value * factor), end = first.end;
  RANGE.lastIndex = first.end;
  const sep = RANGE.exec(text);
  const second = sep ? readNumber(text, RANGE.lastIndex) : null;
  if (sep && second) { out += sep[0] + writeQuantity(second.value * factor); end = second.end; }
  const rest = text.slice(end);
  // "2 tbsp plus 1 tsp", "1 lb / 450 g": a second quantity cannot be scaled by reading the first, so the amount stays as written.
  if (COMPOUND.test(rest.replace(/\([^)]*\)/g, ''))) return { text: amt, scaled: false };
  // "1 cup (240 ml)": a quantity in brackets after a unit word is an equivalent and scales too; "1 (14 oz) can" (brackets right after the number) is a size and stays.
  let tail = rest;
  const open = rest.indexOf('(');
  if (open > 0 && /[A-Za-z]/.test(rest.slice(0, open))) {
    const inner = scaleAmount(rest.slice(open + 1), factor);
    if (inner.scaled) tail = rest.slice(0, open + 1) + inner.text;
  }
  const result = out + tail;
  return result.length > MAX_AMOUNT ? { text: amt, scaled: false } : { text: result, scaled: true };
}

/* ---------- The form: amounts follow the Servings field without drifting ----------
   A row remembers the amount it started from and the servings that amount is for (`base`). Every change of servings scales from that base, never
   from the last result, so 4 to 8 to 4 gives the original text back. Typing an amount by hand makes that text the new base. */

export interface ScaleRow { amt: string; base?: { amt: string; servings: number } }

/** The rows after the servings went from `from` (the last number it held, null if it had none) to `to`, and how many amounts were left as
 *  written. With no earlier number nothing changes: the amounts are taken as being for `to`. */
export function rescale<T extends ScaleRow>(rows: T[], from: number | null, to: number): { rows: T[]; left: number } {
  let left = 0;
  const out = rows.map(r => {
    const base = r.base ?? { amt: r.amt, servings: from ?? to };
    const res = scaleAmount(base.amt, to / base.servings);
    if (!res.scaled && base.amt.trim() && to !== base.servings) left++;
    return { ...r, amt: res.text, base };
  });
  return { rows: out, left };
}

/** A row after the person typed `amt`: that text is now what the servings they see (`at`, null if unknown) are for. */
export const typedAmount = <T extends ScaleRow>(row: T, amt: string, at: number | null): T => ({ ...row, amt, base: at ? { amt, servings: at } : undefined });

/** What the form says after Servings changed from `from` (null: it had no number) to `to`: how the amounts are taken, or how many were left as written. */
export function servingsNote(from: number | null, to: number, left: number, hasAmounts: boolean): string {
  if (from === null) return hasAmounts ? `The amounts are taken as being for ${to} serving${to === 1 ? '' : 's'}.` : '';
  return left ? `${left} amount${left === 1 ? '' : 's'} left as written.` : '';
}
