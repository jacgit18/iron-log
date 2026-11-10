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

/** What Quick add lists: the Recipes meals, then any saved meal that has not moved yet (waiting for room in Recipes), A to Z, each with the foods one tap logs. Ids are prefixed so a recipe and a saved meal never share one. */
export function quickRows(recipes: readonly Recipe[], saved: readonly SavedMeal[], moved: Readonly<Record<string, string>>): { id: string; n: string; items: SavedItem[]; waiting: boolean }[] {
  const own = quickMeals(recipes).map(r => ({ id: `r:${r.id}`, n: r.n, items: mealItems(r, recipes), waiting: false }));
  const old = saved.filter(m => !moved[m.id]).map(m => ({ id: `s:${m.id}`, n: m.n, items: m.items, waiting: true }));
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

/** The saved meals not yet moved become Recipes meals, once each. Stops at the recipe limit (the rest wait). `moved` gains one entry per meal made. */
export function moveMeals(meals: readonly SavedMeal[], moved: Readonly<Record<string, string>>, recipes: Recipe[]): { recipes: Recipe[]; moved: Record<string, string>; added: number; limited: boolean } {
  let list = recipes, added = 0, limited = false;
  const next = { ...moved };
  for (const m of meals) {
    if (next[m.id]) continue;
    if (list.length >= MAX_RECIPES) { limited = true; break; }
    let draft = savedMealToRecipe(m, list);
    if (draft.ing.some(i => i.rid && linkError(list, undefined, i.rid))) draft = savedMealToRecipe(m, list, false); // a part would nest meals too deep: keep the saved totals instead of links
    const made = normRecipe({ ...draft, id: newRecipeId(list.map(r => r.id), draft.n) });
    if (!made) continue;
    list = settleMeals([...list, made]);
    next[m.id] = made.id;
    added++;
  }
  return { recipes: list, moved: next, added, limited };
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
