import type { DietEntry, FoodType, Recipe } from '../types.ts';
import { cleanGrams as cleanDietGrams, cleanKcal, cleanProtein } from '../shared/diet.js';
import { cleanGrams, scaleFood, type FoodHit } from '../shared/foods.js';
import { hasMacros } from './dietLog.js';

/* ---------- Recent and favorites in Quick add (brief nutrition-quick-log): the foods you reach for most, as chips. Pure; the strip calls this. ---------- */

/** The most chips the strip shows. */
export const QUICK_MAX = 8;

export interface QuickItem { id: string; n: string; fav: boolean }

/** The chips: your own foods and recipes that have calories and protein, starred ones first, then the rest by the day they were last logged (newest first). A recipe never logged is
 *  offered only when starred. Within a group, the day logged breaks the order, then the name. At most `limit`; empty when nothing qualifies. */
export function quickItems(entries: readonly DietEntry[], recipes: readonly Recipe[], limit = QUICK_MAX): QuickItem[] {
  const last = new Map<string, string>(); // recipe id -> newest day it was logged
  for (const e of entries) if (e.from && (last.get(e.from) ?? '') < e.d) last.set(e.from, e.d);
  const ok = recipes.filter(r => hasMacros(r) && !r.from?.startsWith('c:') && (r.fav || last.has(r.id)));
  const byRecent = (a: Recipe, b: Recipe) => (last.get(b.id) ?? '').localeCompare(last.get(a.id) ?? '') || a.n.localeCompare(b.n);
  return [...ok.filter(r => r.fav).sort(byRecent), ...ok.filter(r => !r.fav).sort(byRecent)].slice(0, limit).map(r => ({ id: r.id, n: r.n, fav: !!r.fav }));
}

/** A scanned product eaten as `grams` of it, as the ready-made food to create (its numbers are for that amount: one portion) and the numbers to log; null for grams outside 1 to 5000 or numbers
 *  an entry can't hold. */
export function scanFoodDraft(hit: FoodHit, grams: number, type: FoodType): (Pick<DietEntry, 'kcal' | 'p' | 'c' | 'f'> & { recipe: Omit<Recipe, 'id'> }) | null {
  const g = cleanGrams(grams);
  if (g === null) return null;
  const s = scaleFood(hit, g);
  const kcal = cleanKcal(s.kcal), p = cleanProtein(s.p);
  if (kcal === null || p === null) return null;
  const c = s.c === undefined ? null : cleanDietGrams(s.c), f = s.f === undefined ? null : cleanDietGrams(s.f);
  const nums = { kcal, p, ...(c !== null ? { c } : {}), ...(f !== null ? { f } : {}) };
  const n = (hit.brand ? `${hit.name} (${hit.brand})` : hit.name).replace(/\s+/g, ' ').trim().slice(0, 80);
  return { ...nums, recipe: { n, cat: 'ready', type, ing: [], steps: [], ...nums, note: `From a barcode scan: the numbers are for ${g} g.` } };
}
