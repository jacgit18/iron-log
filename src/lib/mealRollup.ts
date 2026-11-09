import { cleanGrams, cleanKcal, cleanProtein } from '../shared/diet.js';
import type { Recipe, RecipeIngredient } from '../types.ts';
import { tabOf } from './recipeList.js';

/* ---------- Meals built from foods (brief meals-from-foods): pure, so every shape is a node test ----------
   A line with a link (`rid`) and an amount (`q`, in the linked food's own unit) counts toward its meal: the meal's calories, protein, carbs and
   fat per serving are the sum of its linked parts times `q`, divided by servings. A part can be a meal itself (up to MAX_LINKS links deep; a
   loop is refused). A meal with the "Use my own numbers" switch (`own`) keeps what was typed. The result is also written into `kcal`, `p`, `c`
   and `f` (see `settleMeals`), so the logger, the planner and the badges keep reading the same fields. A recipe without a `q` line is never
   touched: its typed numbers and its sauce links read exactly as before. */

/** The most links in a chain of meals inside meals (lunch box, sandwich, spread). */
export const MAX_LINKS = 3;

export interface PerServing { kcal: number; p: number; c?: number; f?: number }
export interface Rollup {
  per: PerServing;
  /** Lines that gave numbers, and lines in all (skipped and blank lines are not lines). */
  counted: number;
  total: number;
  /** The linked parts that have no calories and protein yet. */
  needNumbers: string[];
}
type Draft = Pick<Recipe, 'ing'> & Partial<Pick<Recipe, 'id' | 'servings' | 'own' | 'kcal' | 'p' | 'c' | 'f'>>;

const round1 = (n: number) => Math.round(n * 10) / 10;
const quantified = (i: RecipeIngredient): i is RecipeIngredient & { rid: string; q: number } => !!i.rid && i.q !== undefined && !i.skip;

/** Whether a recipe has lines that link to a food or meal with an amount. */
export const hasParts = (r: Pick<Recipe, 'ing'>): boolean => r.ing.some(quantified);
/** Whether a recipe's numbers come from its parts: it has some, and the person did not choose their own. */
export const isRolledUp = (r: Draft): boolean => hasParts(r) && !r.own;

const hasNumbers = (r: Pick<Recipe, 'kcal' | 'p'>): boolean => r.kcal !== undefined && r.p !== undefined;

/** A part's own numbers per serving: rolled up from its parts when it is a meal that rolls up (to `depth` levels), else what it stores. */
function numbersOf(part: Recipe, recipes: readonly Recipe[], seen: ReadonlySet<string>, depth: number): (PerServing & { c?: number; f?: number }) | null {
  if (isRolledUp(part) && depth < MAX_LINKS && !seen.has(part.id)) {
    const r = mealRollup(part, recipes, seen, depth + 1);
    if (r && r.counted > 0) return r.per;
  }
  return hasNumbers(part) ? { kcal: part.kcal!, p: part.p!, ...(part.c !== undefined ? { c: part.c } : {}), ...(part.f !== undefined ? { f: part.f } : {}) } : null;
}

/** A meal's numbers per serving from its linked parts, or null when it has none. `recipes` is the whole list the links resolve in. */
export function mealRollup(meal: Draft, recipes: readonly Recipe[], seen: ReadonlySet<string> = new Set(), depth = 0): Rollup | null {
  if (!hasParts(meal)) return null;
  const path = meal.id ? new Set(seen).add(meal.id) : seen;
  const lines = meal.ing.filter(i => i.n.trim() && !i.skip);
  const used: { n: PerServing; q: number }[] = [], needNumbers: string[] = [];
  for (const i of lines) {
    if (!quantified(i)) continue;
    const part = path.has(i.rid) ? undefined : recipes.find(r => r.id === i.rid);
    if (!part) continue; // a deleted part reads as plain text; a link back to itself adds nothing
    const n = numbersOf(part, recipes, path, depth);
    if (n) used.push({ n, q: i.q }); else needNumbers.push(part.n);
  }
  const servings = meal.servings && meal.servings >= 1 ? meal.servings : 1;
  const sum = (pick: (n: PerServing) => number | undefined) => used.reduce((a, u) => a + (pick(u.n) ?? 0) * u.q, 0) / servings;
  const hasC = used.length > 0 && used.every(u => u.n.c !== undefined), hasF = used.length > 0 && used.every(u => u.n.f !== undefined);
  return {
    per: { kcal: Math.round(sum(n => n.kcal)), p: round1(sum(n => n.p)), ...(hasC ? { c: round1(sum(n => n.c)) } : {}), ...(hasF ? { f: round1(sum(n => n.f)) } : {}) },
    counted: used.length, total: lines.length, needNumbers,
  };
}

/** "2 of 3 ingredients counted", plus which parts still need numbers. */
export function countedNote(r: Rollup): string {
  const parts = [`${r.counted} of ${r.total} ingredient${r.total === 1 ? '' : 's'} counted`];
  if (r.needNumbers.length) parts.push(`needs numbers: ${r.needNumbers.join(', ')}`);
  return parts.join(', ');
}

/** The Foods and Meals a line can link to, Foods first then Meals, each A to Z; never the recipe being edited (`exceptId`). Sauces and
 *  Seasonings have their own picker. */
export function foodCandidates(recipes: readonly Recipe[], exceptId?: string): { foods: Recipe[]; meals: Recipe[] } {
  const byName = (a: Recipe, b: Recipe) => a.n.localeCompare(b.n, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
  const pool = recipes.filter(r => r.id !== exceptId && r.cat !== 'sauces' && r.cat !== 'seasonings');
  return { foods: pool.filter(r => tabOf(r) !== 'meals').sort(byName), meals: pool.filter(r => tabOf(r) === 'meals').sort(byName) };
}

const linksOf = (r: Recipe): string[] => r.ing.flatMap(i => (i.rid ? [i.rid] : []));
/** The longest chain of links going down from a recipe. */
function below(id: string, recipes: readonly Recipe[], path: ReadonlySet<string>): number {
  const r = recipes.find(x => x.id === id);
  if (!r || path.has(id)) return 0;
  const next = new Set(path).add(id);
  return linksOf(r).reduce((m, k) => Math.max(m, 1 + below(k, recipes, next)), 0);
}
/** The longest chain of links going up to a recipe (meals that contain it, and the ones that contain those). */
function above(id: string, recipes: readonly Recipe[], path: ReadonlySet<string>): number {
  if (path.has(id)) return 0;
  const next = new Set(path).add(id);
  return recipes.reduce((m, r) => (linksOf(r).includes(id) ? Math.max(m, 1 + above(r.id, recipes, next)) : m), 0);
}

/** Why `partId` can't go into `meal`, or null: the meal itself, a loop, or a chain more than MAX_LINKS links deep. */
export function linkError(recipes: readonly Recipe[], mealId: string | undefined, partId: string): string | null {
  const part = recipes.find(r => r.id === partId);
  if (!part) return null;
  if (mealId !== undefined) { // a new meal has no id yet: nothing can contain it
    if (partId === mealId) return 'A meal can’t contain itself.';
    if (reaches(partId, mealId, recipes, new Set())) return `${part.n} already contains this meal, so that would loop.`;
  }
  if ((mealId === undefined ? 0 : above(mealId, recipes, new Set())) + 1 + below(partId, recipes, new Set()) > MAX_LINKS) return `Meals can hold other meals up to ${MAX_LINKS} levels deep.`;
  return null;
}
function reaches(from: string, to: string, recipes: readonly Recipe[], seen: Set<string>): boolean {
  if (from === to) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  const r = recipes.find(x => x.id === from);
  return !!r && linksOf(r).some(k => reaches(k, to, recipes, seen));
}

/** The list with every meal that rolls up brought to its parts' current numbers, and each amount line named for its part (a deleted part leaves
 *  plain text). Only recipes with a `q` line are looked at, so any other recipe is returned as it is; the same list comes back when nothing changed. */
export function settleMeals(recipes: Recipe[]): Recipe[] {
  const byId = new Map(recipes.map(r => [r.id, r]));
  let changed = false;
  const next = recipes.map(r => {
    if (!r.ing.some(i => i.q !== undefined)) return r;
    let ing = r.ing.map((i): RecipeIngredient => {
      if (i.q === undefined) return i;
      const part = i.rid ? byId.get(i.rid) : undefined;
      if (!part) { const { rid: _r, q: _q, ...rest } = i; return rest; }
      return part.n === i.n ? i : { ...i, n: part.n };
    });
    if (ing.some((x, k) => x !== r.ing[k])) changed = true; else ing = r.ing;
    let out: Recipe = ing === r.ing ? r : { ...r, ing };
    if (isRolledUp(out)) {
      const roll = mealRollup(out, recipes);
      const kcal = roll && roll.counted > 0 ? cleanKcal(roll.per.kcal) : null, p = roll ? cleanProtein(roll.per.p) : null;
      if (roll && kcal !== null && p !== null) {
        const c = roll.per.c !== undefined ? cleanGrams(roll.per.c) : null, f = roll.per.f !== undefined ? cleanGrams(roll.per.f) : null;
        const { kcal: _k, p: _p, c: _c, f: _f, ...rest } = out;
        const set: Recipe = { ...rest, kcal, p, ...(c !== null ? { c } : {}), ...(f !== null ? { f } : {}) };
        const order = (x: Recipe) => JSON.stringify([x.kcal, x.p, x.c, x.f]);
        if (order(set) !== order(out)) { out = set; changed = true; }
      }
    }
    return out;
  });
  return changed ? next : recipes;
}
