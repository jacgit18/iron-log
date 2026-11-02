import { MAX_AMOUNT } from '../shared/recipes.js';

/* ---------- The amount picker (brief recipe-form-mobile-desktop): pure, so the panel only wires it ----------
   An ingredient amount stays the free text the recipe already stores ("1½ cups"); the picker only composes and reads that text, so scaling
   (recipeScale.ts), matching and old recipes need no change. Text the picker would not write back exactly is kept as typed. */

export const FRACTIONS = ['', '⅛', '¼', '⅓', '½', '⅔', '¾'] as const;
export const UNITS = ['cup', 'tbsp', 'tsp', 'g', 'oz', 'ml', 'lb', 'piece', 'clove', 'slice', 'pinch'] as const;
const PLURAL: Record<string, string> = { cup: 'cups', piece: 'pieces', clove: 'cloves', slice: 'slices' };
const FRACTION_VALUE: Record<string, number> = { '': 0, '⅛': 1 / 8, '¼': 1 / 4, '⅓': 1 / 3, '½': 1 / 2, '⅔': 2 / 3, '¾': 3 / 4 };
export const MAX_WHOLE = 99;

export interface AmountParts { whole: number; frac: string; unit: string }

/** The text for a number, a fraction and a unit: "1½ cups", "½ tsp", "pinch". A unit is plural above one ("cups"); tbsp, tsp, g and the like never change. */
export function composeAmount(p: AmountParts): string {
  const value = p.whole + (FRACTION_VALUE[p.frac] ?? 0);
  const qty = `${p.whole > 0 ? p.whole : ''}${p.frac}`;
  const unit = p.unit && PLURAL[p.unit] && value > 1 ? PLURAL[p.unit]! : p.unit;
  return [qty, unit].filter(Boolean).join(' ');
}

/** What the picker shows for some amount text. `exact`: writing the parts back gives the same text, so the picker can own it; otherwise the
 *  text is kept as typed until a chip is tapped. An empty amount opens at 1. */
export function parseAmount(text: string): { parts: AmountParts; exact: boolean } {
  const t = text.trim();
  if (!t) return { parts: { whole: 1, frac: '', unit: '' }, exact: true };
  const m = /^(?:(\d{1,2})(?!\d))?\s*([⅛¼⅓½⅔¾])?\s*(.*)$/.exec(t)!;
  const rest = m[3]!.trim().toLowerCase();
  const unit = UNITS.find(u => u === rest || PLURAL[u] === rest) ?? '';
  const hasQty = !!(m[1] || m[2]);
  if (!hasQty && !unit) return { parts: { whole: 0, frac: '', unit: '' }, exact: false };
  const parts: AmountParts = { whole: m[1] ? Number(m[1]) : 0, frac: m[2] ?? '', unit };
  return { parts, exact: (unit !== '' || rest === '') && composeAmount(parts) === text };
}

/** The whole number after a Fewer or More tap, kept from 0 to 99. */
export const stepWhole = (whole: number, by: 1 | -1): number => Math.min(MAX_WHOLE, Math.max(0, whole + by));

/** The amounts used last, newest first, one of each, at most `max`. */
export function addRecent(list: string[], text: string, max = 4): string[] {
  const t = text.trim();
  return t ? [t, ...list.filter(x => x !== t)].slice(0, max) : list;
}

const KEY = 'ironlog:recipeAmounts';
/** Recent amounts live in this browser only; a browser that blocks storage simply has none. */
export function loadRecents(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= MAX_AMOUNT).slice(0, 4) : [];
  } catch { return []; }
}
export function saveRecents(list: string[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage blocked: the list is just not kept */ }
}
