import { oldestDay, pruned, roomOn } from '../lib/dietLog.js';
import { renameMeal, saveMeal } from '../lib/dietMeals.js';
import { MAX_DIET_PER_DAY, MAX_KCAL, MAX_PROTEIN, RETAIN_DAYS, normDietCfg, normDietEntries, normDietEntry, rateError, targetError } from '../shared/diet.js';
import { ymd } from '../shared/dates.js';
import type { DietEntry, SavedMeal } from '../types.ts';
import type { DietSlice, StoreGet, StoreSet } from './types.ts';

// Your food log (ADR 086): one document, diet/main, saved like every other (synced when syncing is on, in this browser otherwise). Entries are
// one row each when synced, so two devices logging at once both keep their entries. The typed targets are cfg.diet.
const MAIN = 'diet/main';
const newId = (taken: DietEntry[]) => {
  for (;;) { const id = `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; if (!taken.some(e => e.id === id)) return id; }
};
const newMealId = (taken: SavedMeal[]) => {
  for (;;) { const id = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; if (!taken.some(m => m.id === id)) return id; }
};
const BAD = `Give it a name, calories (1 to ${MAX_KCAL.toLocaleString('en-US')}) and protein (0 to ${MAX_PROTEIN} g).`;

// Saved meals live in cfg.diet.meals (brief diet-saved-meals), so they sync and export with the settings. Every write goes back through normDietCfg.
const mealsOf = (get: StoreGet): SavedMeal[] => get().cfg.diet?.meals ?? [];
const putMeals = (get: StoreGet, meals: SavedMeal[]) => get().mutateCfg(c => {
  const next = { ...(c.diet || {}) };
  if (meals.length) next.meals = meals; else delete next.meals;
  const clean = normDietCfg(next);
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
    if (!e) return { id: null, error: BAD };
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
    const e = normDietEntry(merged);
    if (!e) return BAD;
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
    const meals = mealsOf(get), pick = new Set(entryIds);
    const r = saveMeal(meals, name, get().diet.filter(e => pick.has(e.id)), newMealId(meals));
    if (r.meals === null) return r.error;
    putMeals(get, r.meals);
    return null;
  },

  renameDietMeal(id, name) {
    const r = renameMeal(mealsOf(get), id, name);
    if (r.meals === null) return r.error;
    putMeals(get, r.meals);
    return null;
  },

  removeDietMeal(id) {
    const meals = mealsOf(get); const i = meals.findIndex(m => m.id === id);
    if (i < 0) return;
    const gone = meals[i]!;
    putMeals(get, meals.filter(m => m.id !== id));
    get().noteRemoved('diet', gone.n, () => {
      const now = mealsOf(get);
      if (get().blocked() || now.some(m => m.id === id || m.n.toLowerCase() === gone.n.toLowerCase())) return false;
      const l = [...now]; l.splice(Math.min(i, l.length), 0, gone); putMeals(get, l); return true;
    });
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
