import { PLATE_MARKS, cleanCounts } from '../shared/recipes.js';
import type { PlanSlot, PlateMark, Recipe } from '../types.ts';
import { hasParts } from './mealRollup.js';

/* ---------- The plate check and the day bars' honesty (brief week-board): what a meal covers, what its slot needs, and how complete the fat figure is. Hints, never blocks. Pure; the board calls these. ---------- */

/** Each slot's share of the day's calories. */
export const SLOT_SHARE: Record<PlanSlot, number> = { breakfast: 0.25, lunch: 0.3, dinner: 0.35, snack: 0.1 };
/** What a slot should cover; a snack has no check. */
export const SLOT_NEEDS: Record<PlanSlot, readonly PlateMark[]> = { breakfast: ['protein', 'carb'], lunch: ['protein', 'carb', 'veg'], dinner: ['protein', 'carb', 'veg'], snack: [] };
/** A recipe with this much protein (g) per serving counts as a protein whatever its category. */
export const PROTEIN_G = 25;
/** The fat bar is drawn whole at full coverage, hatched from this share of the planned calories, and replaced by a prompt below it. */
export const FAT_PARTIAL_FROM = 0.7;

const DEFAULT_OF = { protein: ['protein'], carbs: ['carb'], sides: ['veg'] } as const;

/** What a recipe covers on a plate: what the person set (`counts`); else, for a meal built from foods, everything its parts cover; else its category (Protein, Carbs, Sides), plus protein for a recipe with about 25 g or more per serving. `recipes` resolves a meal's parts. */
export function marksOf(r: Recipe, recipes: readonly Recipe[] = [], seen: ReadonlySet<string> = new Set()): PlateMark[] {
  const set = cleanCounts(r.counts);
  if (set) return set;
  const marks = new Set<PlateMark>();
  if (hasParts(r) && !seen.has(r.id)) {
    const path = new Set(seen).add(r.id);
    for (const i of r.ing) {
      const part = i.rid && i.q !== undefined && !i.skip ? recipes.find(x => x.id === i.rid) : undefined;
      if (part) marksOf(part, recipes, path).forEach(m => marks.add(m));
    }
  }
  if (!marks.size) { // no parts, or none that resolve: the category and the protein figure
    (DEFAULT_OF[r.cat as keyof typeof DEFAULT_OF] ?? []).forEach(m => marks.add(m));
    if (r.p !== undefined && r.p >= PROTEIN_G) marks.add('protein');
  }
  return PLATE_MARKS.filter(m => marks.has(m));
}

/** What a slot's foods cover against what the slot needs: the marks needed, the ones covered, the ones missing. A slot with nothing in it has nothing to check. */
export function plateCheck(slot: PlanSlot, foods: readonly Recipe[], recipes: readonly Recipe[] = foods): { need: readonly PlateMark[]; have: PlateMark[]; missing: PlateMark[] } {
  const need = SLOT_NEEDS[slot];
  if (!foods.length || !need.length) return { need: [], have: [], missing: [] };
  const covered = new Set(foods.flatMap(f => marksOf(f, recipes)));
  return { need, have: need.filter(m => covered.has(m)), missing: need.filter(m => !covered.has(m)) };
}

/** The share of a day's planned calories that come from foods with a fat figure, 0 to 1 (1 for an empty day: nothing is missing). */
export function fatCoverage(foods: readonly { r: Pick<Recipe, 'kcal' | 'f'>; x: number }[]): number {
  const total = foods.reduce((a, { r, x }) => a + (r.kcal ?? 0) * x, 0);
  if (total <= 0) return foods.every(({ r }) => r.f !== undefined) ? 1 : 0;
  const share = foods.reduce((a, { r, x }) => a + (r.f !== undefined ? (r.kcal ?? 0) * x : 0), 0) / total;
  return foods.some(({ r }) => r.f === undefined && r.kcal === undefined) ? Math.min(share, 0.99) : share; // a food with neither figure weighs nothing, but it still keeps the bar from being whole
}

/** How to draw the fat bar: whole, hatched with "n of m foods", or not at all. */
export const fatBarState = (coverage: number): 'full' | 'partial' | 'hidden' => (coverage >= 1 ? 'full' : coverage >= FAT_PARTIAL_FROM ? 'partial' : 'hidden');
