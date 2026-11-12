import { skipSnack } from '../lib/dailySnacks.js';
import { oldestDay, pruned, roomOn } from '../lib/dietLog.js';
import { addItem, removeItem, setEaten, setPortion, type Plan } from '../lib/dietPlan.js';
import { monthKey } from '../lib/grocery.js';
import { moveMeals, remapPlan } from '../lib/quickMeals.js';
import { copyEaten } from '../lib/moveCopyEaten.js';
import { shortDay } from '../lib/nutritionBoard.js';
import { moveItem } from '../lib/weekBoard.js';
import { idsAdded, shoppingRecipeIds } from '../lib/weekShopping.js';
import { savedMealToRecipe } from '../lib/savedMealToRecipe.js';
import { MAX_DIET_PER_DAY, MAX_KCAL, MAX_MEAL_ITEMS, MAX_MEAL_NAME, MAX_PROTEIN, RETAIN_DAYS, normDietCfg, normDietEntries, normDietEntry, rateError, targetError } from '../shared/diet.js';
import { ymd } from '../shared/dates.js';
import type { DailySnack, DietEntry, SavedMeal } from '../types.ts';
import type { DietSlice, StoreGet, StoreSet } from './types.ts';

// Your food log (ADR 086): one document, diet/main, saved like every other (synced when syncing is on, in this browser otherwise). Entries are
// one row each when synced, so two devices logging at once both keep their entries. The typed targets are cfg.diet.
const MAIN = 'diet/main';
const newId = (taken: DietEntry[]) => {
  for (;;) { const id = `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; if (!taken.some(e => e.id === id)) return id; }
};
// A function, not a constant: toLocaleString at module load cost startup time for a message shown only on a bad entry.
const bad = () => `Give it a name, calories (1 to ${MAX_KCAL.toLocaleString('en-US')}) and protein (0 to ${MAX_PROTEIN} g).`;

// Saved meals live in cfg.diet.meals (brief diet-saved-meals), so they sync and export with the settings. Every write goes back through normDietCfg.
const mealsOf = (get: StoreGet): SavedMeal[] => get().cfg.diet?.meals ?? [];

// The plan lives in cfg.diet.plan (brief diet-meal-planner), keyed by date; every write goes back through normDietCfg with today, which drops earlier days.
const planOf = (get: StoreGet): Plan => get().cfg.diet?.plan ?? {};
const putPlan = (get: StoreGet, plan: Plan, skips?: Record<string, string[]>) => get().mutateCfg(c => {
  const next = { ...(c.diet || {}) };
  if (Object.keys(plan).length) next.plan = plan; else delete next.plan;
  if (skips) { if (Object.keys(skips).length) next.snackSkips = skips; else delete next.snackSkips; } // the daily snack skips go in the same write as the plan change that needs them
  const clean = normDietCfg(next, ymd(new Date()));
  if (clean) c.diet = clean; else delete c.diet;
});

// A listed daily snack (brief daily-snacks) that leaves a day (removed there, or moved to another day) is skipped on that day, so its listed copy does not come back in its place.
const skipsAfterLeaving = (get: StoreGet, day: string, item: { k: string; id: string } | undefined): Record<string, string[]> | undefined =>
  item && item.k === 'r' && get().cfg.diet?.snacks?.some(x => x.id === item.id) ? skipSnack(get().cfg.diet?.snackSkips, day, item.id) : undefined;

export const dietSlice = (set: StoreSet, get: StoreGet): DietSlice => ({
  diet: [],

  saveDiet() { get().saveDoc(MAIN, { items: get().diet }); },

  addDietEntry(d) {
    const list = get().diet;
    if (!roomOn(list, d.d)) return { id: null, error: `You can log ${MAX_DIET_PER_DAY} things a day.` };
    const now = new Date(), today = ymd(now);
    const e = normDietEntry({ ...d, id: newId(list), ...(d.d === today ? { t: now.getHours() } : {}) });
    if (!e) return { id: null, error: bad() };
    if (e.d < oldestDay(today)) return { id: null, error: `Entries are kept for ${RETAIN_DAYS} days, so that day is too far back.` };
    set({ diet: pruned([...list, e], today) });
    get().saveDiet();
    return { id: e.id, error: null };
  },

  copyDietEntry(id, toDay, move = false) {
    const list = get().diet, today = ymd(new Date());
    const r = copyEaten(list, id, toDay, today, newId(list), move);
    if (r.error || !r.id) return { id: null, error: r.error ?? 'Couldn’t log that.' };
    const gone = list.find(e => e.id === id)!, at = list.indexOf(gone), copyId = r.id;
    set({ diet: pruned(r.list, today) });
    get().saveDiet();
    if (move) {
      // Undo puts the original back where it was and takes the copy away again, so an undone move is a no-op (nothing duplicated).
      get().noteRemoved('diet', `${gone.n} to ${shortDay(toDay)}`, () => {
        if (get().blocked() || get().diet.some(e => e.id === id) || !get().diet.some(e => e.id === copyId)) return false;
        const l = get().diet.filter(e => e.id !== copyId);
        if (!roomOn(l, gone.d)) return false; // the day filled up since: Undo must not push it past the limit
        l.splice(Math.min(at, l.length), 0, gone);
        set({ diet: normDietEntries(l) }); get().saveDiet(); return true;
      }, { verb: 'Moved' });
    }
    return { id: copyId, error: null };
  },

  updateDietEntry(id, patch) {
    const list = get().diet; const cur = list.find(e => e.id === id);
    if (!cur) return 'That entry is gone.';
    const merged: Record<string, unknown> = { ...cur, ...patch };
    if (merged.c === null) delete merged.c; // null clears an optional number
    if (merged.f === null) delete merged.f;
    // An explicit `micro` (the typed rows of brief type-food-amounts; null clears) is the person's say. Without one, changed calories mean a changed portion: the amounts would no longer match (the One-off form's rule).
    if (patch.micro !== undefined) { if (patch.micro === null) delete merged.micro; }
    else if (patch.kcal !== undefined && patch.kcal !== cur.kcal) delete merged.micro;
    const e = normDietEntry(merged);
    if (!e) return bad();
    set({ diet: list.map(x => (x.id === id ? e : x)) });
    get().saveDiet();
    return null;
  },

  removeDietEntry(id, undoNotice = true) {
    const list = get().diet; const i = list.findIndex(e => e.id === id);
    if (i < 0) return;
    const gone = list[i]!;
    set({ diet: list.filter(e => e.id !== id) });
    get().saveDiet();
    if (!undoNotice) return;
    get().noteRemoved('diet', gone.n, () => {
      if (get().blocked() || get().diet.some(e => e.id === id)) return false;
      const l = [...get().diet]; l.splice(Math.min(i, l.length), 0, gone); set({ diet: normDietEntries(l) }); get().saveDiet(); return true;
    });
  },

  saveDietMeal(name, entryIds) {
    const n = name.trim().slice(0, MAX_MEAL_NAME), picked = get().diet.filter(e => entryIds.includes(e.id));
    if (!n) return 'Give the meal a name.';
    if (!picked.length) return 'Tick at least one food.';
    if (picked.length > MAX_MEAL_ITEMS) return `A meal can hold ${MAX_MEAL_ITEMS} foods.`;
    const recipes = get().recipes;
    if (recipes.some(r => r.n.trim().toLowerCase() === n.toLowerCase())) return 'You already have a recipe or meal with that name.';
    const items = picked.map(e => ({ n: e.n, kcal: e.kcal, p: e.p, ...(e.c !== undefined ? { c: e.c } : {}), ...(e.f !== undefined ? { f: e.f } : {}), ...(e.from ? { from: e.from } : {}) }));
    return get().saveRecipe(savedMealToRecipe({ id: '', n, items }, recipes)); // a Recipes meal: linked foods when they still match, else the logged totals
  },

  moveSavedMeals() {
    const st = get(), meals = mealsOf(get), have = st.cfg.diet?.mealsMoved ?? {};
    if (!st.isReady() || !st.recipesLoaded || meals.every(m => have[m.id])) return 0;
    const r = moveMeals(meals, have, st.recipes);
    if (!r.added && !r.found) return 0;
    if (r.added) {
      set({ recipes: r.recipes });
      get().saveRecipes(); // recipes first: if the settings write below fails, the next load finds each recipe by its fromMeal mark and rebuilds the moved record (no copy, no lost meal)
    }
    get().mutateCfg(c => {
      const next = { ...(c.diet || {}), mealsMoved: r.moved };
      const plan = remapPlan(next.plan, r.moved);
      if (plan) next.plan = plan;
      const clean = normDietCfg(next);
      if (clean) c.diet = clean; else delete c.diet;
    });
    return r.added;
  },

  addPlanItem(day, kind, id, slot) {
    const there = kind === 'r' ? get().recipes.some(r => r.id === id) : mealsOf(get).some(m => m.id === id);
    if (!there) return kind === 'r' ? 'That recipe is gone.' : 'That meal is gone.';
    const r = addItem(planOf(get), day, { k: kind, id, ...(slot ? { s: slot } : {}) }, ymd(new Date()));
    if (r.plan === null) return r.error;
    putPlan(get, r.plan);
    return null;
  },

  movePlanItem(day, index, toDay, slot) {
    const r = moveItem(planOf(get), day, index, toDay, slot, ymd(new Date()));
    if (r.plan === null) return r.error;
    putPlan(get, r.plan, toDay !== day ? skipsAfterLeaving(get, day, planOf(get)[day]?.[index]) : undefined);
    return null;
  },

  setPlanPortion(day, index, portion) {
    const plan = planOf(get), next = setPortion(plan, day, index, portion);
    if (next !== plan) putPlan(get, next);
  },

  removePlanItem(day, index) { putPlan(get, removeItem(planOf(get), day, index), skipsAfterLeaving(get, day, planOf(get)[day]?.[index])); },

  // Daily snacks (brief daily-snacks): the saved list in cfg.diet.snacks, shown in Snack on every day of the plan window.
  saveDailySnacks(list: DailySnack[]) {
    get().mutateCfg(c => {
      const next = { ...(c.diet || {}) };
      if (list.length) next.snacks = list; else delete next.snacks;
      if (next.snackSkips) { // a skip belongs to a snack on the list: one removed and added back starts clean
        const keep = new Set(list.map(s => s.id));
        const left = Object.fromEntries(Object.entries(next.snackSkips).map(([d, ids]) => [d, ids.filter(i => keep.has(i))] as const).filter(([, ids]) => ids.length));
        if (Object.keys(left).length) next.snackSkips = left; else delete next.snackSkips;
      }
      const clean = normDietCfg(next, ymd(new Date()));
      if (clean) c.diet = clean; else delete c.diet;
    });
  },

  // One listed snack, today only: it is skipped on that day and comes back on the next.
  skipDailySnack(day, id) { putPlan(get, planOf(get), skipSnack(get().cfg.diet?.snackSkips, day, id)); },

  // A listed snack that is only shown becomes a real item of that day's Snack (so it can be ticked, changed or moved); the index of the real item, or an error text (a full day).
  realizeDailySnack(day, id) {
    const have = (planOf(get)[day] ?? []).findIndex(i => i.k === 'r' && i.id === id && i.s === 'snack');
    if (have >= 0) return have;
    const listed = get().cfg.diet?.snacks?.find(x => x.id === id);
    const r = addItem(planOf(get), day, { k: 'r', id, ...(listed?.x ? { x: listed.x } : {}), s: 'snack' }, ymd(new Date()));
    if (r.plan === null) return r.error;
    putPlan(get, r.plan);
    return r.plan[day]!.length - 1;
  },

  setPlanEaten(day, index, ids) { putPlan(get, setEaten(planOf(get), day, index, ids)); },

  // Week to Shopping (brief week-shopping): each planned, uneaten recipe on those days puts its missing ingredients on Shopping through the recipe's own button; `ids` are the items this call created, for Undo.
  planToShopping(days, month = monthKey(new Date())) {
    const recipeIds = shoppingRecipeIds(planOf(get), days, get().recipes, get().diet), before = get().grocery.items;
    let added = 0, already = 0, refused: string | null = null;
    for (const id of recipeIds) { const r = get().addMissingToGrocery(id, month); added += r.added; already += r.already; refused ??= r.refused; }
    return { added, already, refused, recipes: recipeIds.length, ids: idsAdded(before, get().grocery.items) };
  },

  uncheckPlanItem(day, index) {
    const ids = planOf(get)[day]?.[index]?.e ?? [];
    ids.forEach(id => get().removeDietEntry(id, false));
    putPlan(get, setEaten(planOf(get), day, index, []));
  },

  setDietPace(pace, rate) {
    if (pace === 'custom') { const bad = rateError(rate ?? null); if (bad) return bad; }
    get().mutateCfg(c => {
      const next = { ...(c.diet || {}) };
      delete next.pace; delete next.rate;
      if (pace) next.pace = pace;
      if (pace === 'custom') next.rate = rate;
      const clean = normDietCfg(next);
      if (clean) c.diet = clean; else delete c.diet;
    });
    return null;
  },

  setDietTarget(key, value) {
    const bad = targetError(key, value);
    if (bad) return bad;
    get().mutateCfg(c => {
      const next = { ...(c.diet || {}) };
      if (value === null) delete next[key]; else next[key] = Math.round(value);
      const clean = normDietCfg(next);
      if (clean) c.diet = clean; else delete c.diet;
    });
    return null;
  },
});
