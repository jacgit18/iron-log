import { oldestDay, pruned, roomOn } from '../lib/dietLog.js';
import { addItem, removeItem, setEaten, setPortion, type Plan } from '../lib/dietPlan.js';
import { moveMeals, remapPlan } from '../lib/quickMeals.js';
import { moveItem } from '../lib/weekBoard.js';
import { savedMealToRecipe } from '../lib/savedMealToRecipe.js';
import { MAX_DIET_PER_DAY, MAX_KCAL, MAX_MEAL_ITEMS, MAX_MEAL_NAME, MAX_PROTEIN, RETAIN_DAYS, normDietCfg, normDietEntries, normDietEntry, rateError, targetError } from '../shared/diet.js';
import { ymd } from '../shared/dates.js';
import type { DietEntry, SavedMeal } from '../types.ts';
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
const putPlan = (get: StoreGet, plan: Plan) => get().mutateCfg(c => {
  const next = { ...(c.diet || {}) };
  if (Object.keys(plan).length) next.plan = plan; else delete next.plan;
  const clean = normDietCfg(next, ymd(new Date()));
  if (clean) c.diet = clean; else delete c.diet;
});

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
    if (!r.added && Object.keys(r.moved).length === Object.keys(have).length) return 0;
    if (r.added) set({ recipes: r.recipes });
    if (r.added) get().saveRecipes(); // recipes first: if the settings write below fails, the next load moves again (a copy), never loses a meal
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
    putPlan(get, r.plan);
    return null;
  },

  setPlanPortion(day, index, portion) {
    const plan = planOf(get), next = setPortion(plan, day, index, portion);
    if (next !== plan) putPlan(get, next);
  },

  removePlanItem(day, index) { putPlan(get, removeItem(planOf(get), day, index)); },

  setPlanEaten(day, index, ids) { putPlan(get, setEaten(planOf(get), day, index, ids)); },

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
