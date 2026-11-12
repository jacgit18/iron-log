import type { DietCfg, PlanItem, Recipe, SavedItem, SavedMeal } from '../types.ts';
import { MAX_RECIPES, normRecipe } from '../shared/recipes.js';
import { servingNumbers } from './dietLog.js';
import { hasParts, linkError, settleMeals } from './mealRollup.js';
import { newRecipeId } from './recipeDraft.js';
import { savedMealToRecipe } from './savedMealToRecipe.js';
import { usesOf } from './recipeUses.js';
import { sortByName } from './sort.js';

/* ---------- Meals in Quick add and the move of saved meals into Recipes (brief saved-meals-into-recipes, part 2). Pure; the store and the Quick add row call these. ---------- */

/** The meals Quick add offers: a recipe built from linked foods, or a plain meal (Other, used as a meal) that has calories and protein. A to Z. */
export function quickMeals(recipes: readonly Recipe[]): Recipe[] {
  const isMeal = (r: Recipe) => hasParts(r) || (r.cat === 'other' && usesOf(r).includes('meal') && r.kcal !== undefined && r.p !== undefined);
  return sortByName(recipes.filter(isMeal), r => r.n, r => r.id);
}

/** The old saved-meals list as the views may read it, while it is still kept for one release (brief saved-meals-removal): `held` is the saved meals that have no recipe yet (the 300-recipe limit stopped their move), `moved` the saved-meal id to recipe id record that plan items resolve through. Once every saved meal has moved, `held` is empty and the old list is not read at all. */
export interface LegacyMeals { held: SavedMeal[]; moved: Readonly<Record<string, string>> }

const NO_HELD: SavedMeal[] = [], NO_MOVED: Readonly<Record<string, string>> = {};
const gated = new WeakMap<object, LegacyMeals>();

/** The gate: what is still read from `cfg.diet`'s old list. The same object comes back for the same `diet`, so a view can keep it. */
export function legacyMeals(diet: Pick<DietCfg, 'meals' | 'mealsMoved'> | undefined): LegacyMeals {
  if (!diet) return { held: NO_HELD, moved: NO_MOVED };
  const hit = gated.get(diet);
  if (hit) return hit;
  const moved = diet.mealsMoved ?? NO_MOVED;
  const held = (diet.meals ?? NO_HELD).filter(m => !moved[m.id]);
  const out: LegacyMeals = { held: held.length ? held : NO_HELD, moved };
  gated.set(diet, out);
  return out;
}

/** The line under Saved meals: the usual one, or, while saved meals are held back, why. Recipes being full (`recipeCount` at the limit) is the one reason with something to do; a meal that stays held while there is room (the move skips one it cannot make into a recipe) is only said to be kept here. */
export const savedMealsNote = (held: readonly SavedMeal[], recipeCount: number): string => {
  if (!held.length) return 'Rename or edit a meal in Recipes.';
  if (recipeCount >= MAX_RECIPES) return `Some saved meals are waiting because Recipes is full (${MAX_RECIPES} recipes). Delete a recipe to make room in Recipes and they move in the next time the app opens. Rename or edit a meal in Recipes.`;
  return 'Some saved meals could not move into Recipes, so they are kept here and still work. Rename or edit a meal in Recipes.';
};

/** What Quick add lists: the Recipes meals, then any saved meal held back by the gate, A to Z, each with the foods one tap logs. Ids are prefixed so a recipe and a saved meal never share one. */
export function quickRows(recipes: readonly Recipe[], held: readonly SavedMeal[]): { id: string; n: string; items: SavedItem[] }[] {
  const own = quickMeals(recipes).map(r => ({ id: `r:${r.id}`, n: r.n, items: mealItems(r, recipes) }));
  const old = held.map(m => ({ id: `s:${m.id}`, n: m.n, items: m.items }));
  return sortByName([...own, ...old].filter(m => m.items.length > 0), m => m.n, m => m.id);
}

/** The foods one tap logs for a meal, each as its own entry: a linked meal gives each part at the amount it holds (a part that is gone or has no numbers is left out); any other meal, or one on its own numbers, gives one entry with its totals. */
export function mealItems(meal: Recipe, recipes: readonly Recipe[]): SavedItem[] {
  if (hasParts(meal) && !meal.own) {
    const items: SavedItem[] = [];
    for (const i of meal.ing) {
      const part = i.rid && i.q !== undefined && !i.skip ? recipes.find(r => r.id === i.rid) : undefined;
      const n = part ? servingNumbers(part, i.q!) : null;
      if (part && n) items.push({ n: part.n, kcal: n.kcal, p: n.p, ...(n.c !== undefined ? { c: n.c } : {}), ...(n.f !== undefined ? { f: n.f } : {}), from: part.id });
    }
    if (items.length) return items;
  }
  if (meal.kcal === undefined || meal.p === undefined) return [];
  return [{ n: meal.n, kcal: meal.kcal, p: meal.p, ...(meal.c !== undefined ? { c: meal.c } : {}), ...(meal.f !== undefined ? { f: meal.f } : {}) }];
}

/** The saved meals not yet moved become Recipes meals, once each, each marked with `fromMeal`. A meal whose recipe already carries its mark (a repeat, or a second device whose recipes synced before its settings) is not made again: `moved` is rebuilt from the mark. Stops at the recipe limit (the rest wait). `moved` gains one entry per meal made or found; `found` counts the ones found by their mark. */
export function moveMeals(meals: readonly SavedMeal[], moved: Readonly<Record<string, string>>, recipes: Recipe[]): { recipes: Recipe[]; moved: Record<string, string>; added: number; found: number; limited: boolean } {
  let list = recipes, added = 0, found = 0, limited = false;
  const next = { ...moved };
  for (const m of meals) {
    if (next[m.id]) continue;
    const have = list.find(r => r.fromMeal === m.id);
    if (have) { next[m.id] = have.id; found++; continue; }
    if (list.length >= MAX_RECIPES) { limited = true; break; }
    let draft = savedMealToRecipe(m, list);
    if (draft.ing.some(i => i.rid && linkError(list, undefined, i.rid))) draft = savedMealToRecipe(m, list, false); // a part would nest meals too deep: keep the saved totals instead of links
    const made = normRecipe({ ...draft, fromMeal: m.id, id: newRecipeId(list.map(r => r.id), draft.n) });
    if (!made) continue;
    list = settleMeals([...list, made]);
    next[m.id] = made.id;
    added++;
  }
  return { recipes: list, moved: next, added, found, limited };
}

/** The plan with every saved-meal item that has moved pointed at the recipe it became (same day, place and no portion: a meal is one portion). The same object comes back when nothing changed. */
export function remapPlan(plan: DietCfg['plan'], moved: Readonly<Record<string, string>>): DietCfg['plan'] {
  if (!plan) return plan;
  let changed = false;
  const out: Record<string, PlanItem[]> = {};
  for (const [day, items] of Object.entries(plan)) {
    out[day] = items.map(it => { const to = it.k === 'm' ? moved[it.id] : undefined; if (!to) return it; changed = true; return { k: 'r' as const, id: to }; });
  }
  return changed ? out : plan;
}
