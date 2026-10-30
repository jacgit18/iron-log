import type { DietEntry, Recipe } from '../types.ts';
import { cleanGrams, cleanKcal, cleanProtein } from '../shared/diet.js';

/* ---------- Less typing for a meal (brief diet-auto-macros): calories from macros, foods you ate before, a portion of one. Pure; the form and the log call these. ---------- */

/** Calories from grams: 4 per gram of protein and carbs, 9 per gram of fat, rounded. Null unless all three are numbers of 0 or more. */
export function kcalFromMacros(p: number | null, c: number | null, f: number | null): number | null {
  if (p === null || c === null || f === null) return null;
  if (![p, c, f].every(x => Number.isFinite(x) && x >= 0)) return null;
  return cleanKcal(4 * p + 4 * c + 9 * f);
}

export interface Food { n: string; kcal: number; p: number; c?: number; f?: number; from?: string }

/** Foods to offer for `query` (case-blind, a name that starts with it first, then one that contains it): what you logged before (one per name, newest first, a recipe you logged counts under its recipe) and your own recipes that have calories and protein. An empty query offers nothing. */
export function findFoods(entries: DietEntry[], recipes: Recipe[], query: string, limit = 6): Food[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const seen = new Set<string>(), all: Food[] = [];
  const add = (x: Food) => { const k = x.n.toLowerCase(); if (!seen.has(k)) { seen.add(k); all.push(x); } };
  recipes.filter(r => r.kcal !== undefined && r.p !== undefined && !r.from?.startsWith('c:')).forEach(r => add({ n: r.n, kcal: r.kcal!, p: r.p!, ...(r.c !== undefined ? { c: r.c } : {}), ...(r.f !== undefined ? { f: r.f } : {}), from: r.id }));
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]!;
    if (e.from) continue; // logged from a recipe: the recipe itself is offered
    add({ n: e.n, kcal: e.kcal, p: e.p, ...(e.c !== undefined ? { c: e.c } : {}), ...(e.f !== undefined ? { f: e.f } : {}) });
  }
  const starts = all.filter(x => x.n.toLowerCase().startsWith(q)), has = all.filter(x => !x.n.toLowerCase().startsWith(q) && x.n.toLowerCase().includes(q));
  return [...starts, ...has].slice(0, limit);
}

/** `food` for `portion` portions (1 is as saved), or null when a number goes out of range. Carbs and fat come along when the food has them. */
export function scaleFood(food: Food, portion: number): Food | null {
  if (!(portion > 0)) return null;
  const kcal = cleanKcal(food.kcal * portion), p = cleanProtein(food.p * portion);
  if (kcal === null || p === null) return null;
  const c = food.c === undefined ? null : cleanGrams(food.c * portion), f = food.f === undefined ? null : cleanGrams(food.f * portion);
  return { n: food.n, kcal, p, ...(c !== null ? { c } : {}), ...(f !== null ? { f } : {}), ...(food.from ? { from: food.from } : {}) };
}
