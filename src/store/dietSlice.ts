import { skipSnack } from '../lib/dailySnacks.js';
import { dropRepeatSkips, pruneHandy, repeatPlanItem, removeRepeat, retargetRepeats, removeRepeatsFor, saveRepeat, skipRepeat, skipsAfterLeaving as repeatSkipsAfterLeaving, skipsAfterRemovingHandy, unskipRepeat } from '../lib/repeats.js';
import { withHintSwitch } from '../lib/plate.js';
import { oldestDay, pruned, roomOn } from '../lib/dietLog.js';
import { addItem, canBePlanned, inWindow, markPlanned, planFullReason, removeItem, resolve, setEaten, setPortion, type Plan } from '../lib/dietPlan.js';
import { applyForward, forwardText, planForward } from '../lib/planForward.js';
import { entryTotalsAt, portionBasis } from '../lib/portionBasis.js';
import { monthKey } from '../lib/grocery.js';
import { moveMeals, remapPlan } from '../lib/quickMeals.js';
import { plannedText, resultText, type SkippedDay } from '../lib/dayPicker.js';
import { copyEaten, copyEatenMany } from '../lib/moveCopyEaten.js';
import { shortDay } from '../lib/nutritionBoard.js';
import { followFoodMeal, snackMealOf } from '../lib/usualMeal.js';
import { addItemsToDays, copyItemToDays, moveItem } from '../lib/weekBoard.js';
import { idsAdded, plannedShoppingIds } from '../lib/weekShopping.js';
import { drinkIdsOf } from '../lib/recipeUses.js';
import { savedMealToRecipe } from '../lib/savedMealToRecipe.js';
import { MAX_DIET_PER_DAY, MAX_KCAL, MAX_MEAL_ITEMS, MAX_MEAL_NAME, MAX_PROTEIN, RETAIN_DAYS, normDietCfg, normDietEntries, normDietEntry, rateError, samePlanItem, targetError } from '../shared/diet.js';
import { ymd } from '../shared/dates.js';
import type { DailySnack, DietEntry, PlanItem, PlanSlot, RepeatItem, SavedMeal } from '../types.ts';
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
const drinksOf = (get: StoreGet) => drinkIdsOf(get().recipes);
const planOf = (get: StoreGet): Plan => get().cfg.diet?.plan ?? {};

/** The item marked planned when the day has room (fewer than 8 planned things) and it can be planned (never a drink or a listed daily snack): adding food with a Plan button puts it on the plate (brief nutrition-planned-available-tray); on a day that holds 8 it is stored unplanned and waits in the tray. */
const markedIfRoom = (get: StoreGet, day: string, item: PlanItem): PlanItem => {
  const d = get().cfg.diet;
  return canBePlanned(item, d?.snacks, drinksOf(get)) && !planFullReason(d?.plan?.[day] ?? [], d?.snacks, drinksOf(get)) ? { ...item, p: true } : item;
};

/** Puts a recipe or saved meal on a day and says where it landed: the stored index of the item just added (found by its own kind, id and meal in the saved plan, never "the last one"), or an error text. */
function addPlanItemAt(get: StoreGet, day: string, kind: 'r' | 'm', id: string, slot?: PlanSlot): { error: string; index: -1 } | { error: null; index: number } {
  const there = kind === 'r' ? get().recipes.some(r => r.id === id) : mealsOf(get).some(m => m.id === id);
  if (!there) return { error: kind === 'r' ? 'That recipe is gone.' : 'That meal is gone.', index: -1 };
  const item = markedIfRoom(get, day, { k: kind, id, ...(slot ? { s: slot } : {}) });
  const r = addItem(planOf(get), day, item, ymd(new Date()), get().cfg.diet?.snacks, drinksOf(get));
  if (r.plan === null) return { error: r.error, index: -1 };
  putPlan(get, r.plan);
  const index = (planOf(get)[day] ?? []).findIndex(i => samePlanItem(i, item));
  return index < 0 ? { error: 'That could not be added.', index: -1 } : { error: null, index };
}
const putPlan = (get: StoreGet, plan: Plan, skips?: Record<string, string[]>, repeatSkips?: Record<string, string[]>) => get().mutateCfg(c => {
  const next = { ...(c.diet || {}) };
  if (Object.keys(plan).length) next.plan = plan; else delete next.plan;
  if (skips) { if (Object.keys(skips).length) next.snackSkips = skips; else delete next.snackSkips; } // the daily snack skips go in the same write as the plan change that needs them
  if (repeatSkips) { if (Object.keys(repeatSkips).length) next.repeatSkips = repeatSkips; else delete next.repeatSkips; } // and so do the repeat skips
  const clean = normDietCfg(next, ymd(new Date()));
  if (clean) c.diet = clean; else delete c.diet;
});

// A listed daily snack (brief daily-snacks) that leaves a day from Snack (removed there, or moved to another day) is skipped on that day, so its listed copy does not come back in its place.
// Only an item in Snack counts: the same recipe planned by hand in another meal is the person's own plan, and taking it out leaves the listed snack as it was.
const skipsAfterLeaving = (get: StoreGet, day: string, item: { k: string; id: string; s?: string } | undefined): Record<string, string[]> | undefined =>
  item && item.k === 'r' && item.s === snackMealOf(item.id, get().recipes) && get().cfg.diet?.snacks?.some(x => x.id === item.id) ? skipSnack(get().cfg.diet?.snackSkips, day, item.id) : undefined;

// A stored item that stands for a repeat (the same food in the same meal, on a day the repeat shows) and leaves its place skips that repeat on that day, so the repeat does not come back where the item was.
const repeatSkipsAfter = (get: StoreGet, day: string, item: PlanItem | undefined): Record<string, string[]> | undefined => repeatSkipsAfterLeaving(get().cfg.diet?.repeats, get().cfg.diet?.repeatSkips, day, item);

// One write for the plan and the repeat list together (a forward Plan, and its Undo, change both); the result goes back through normDietCfg.
const putPlanAndRepeats = (get: StoreGet, plan: Plan, repeats: readonly RepeatItem[] | undefined) => get().mutateCfg(c => {
  const next = { ...(c.diet || {}) };
  if (Object.keys(plan).length) next.plan = plan; else delete next.plan;
  if (repeats?.length) next.repeats = [...repeats]; else delete next.repeats;
  const clean = normDietCfg(next, ymd(new Date()));
  if (clean) c.diet = clean; else delete c.diet;
});

/** The plan with `p` taken off the item of that food and meal on each of `days`, and off the repeat `rid`: the Undo of a Plan (only what that Plan marked, so a later edit elsewhere is kept). */
function withoutPlanned(plan: Plan, repeats: readonly RepeatItem[] | undefined, days: readonly string[], food: PlanItem, rid: string | null): { plan: Plan; repeats: RepeatItem[] | undefined } {
  const next: Plan = { ...plan };
  for (const d of days) next[d] = (plan[d] ?? []).map(i => { if (!samePlanItem(i, food)) return i; const { p: _p, ...rest } = i; return rest; });
  return { plan: next, repeats: repeats?.map(r => { if (r.rid !== rid) return r; const { p: _p, ...rest } = r; return rest; }) };
}

const keyedMicro = (m: unknown): string => Object.entries((m && typeof m === 'object' ? m : {}) as Record<string, number>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join(',');
const sameMicro = (a: unknown, b: unknown): boolean => keyedMicro(a) === keyedMicro(b);

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

  // Copy (or move) one eaten entry to several days as ONE write per document (brief nutrition-multi-day-picker): the log list is set and saved once, and the plan cards for days ahead go in one plan write. A full or invalid day is skipped and named; a move takes one day and is refused whole when its plan card can't be added, so nothing is half-copied.
  copyDietEntries(id, days, move = false) {
    const list = get().diet, today = ymd(new Date());
    const refuse = (error: string) => ({ done: [], skipped: [], message: error, error });
    const r = copyEatenMany(list, id, days, today, newId, move, get().recipes);
    if (r.error) return refuse(r.error);
    const plan = addItemsToDays(planOf(get), r.planAdds, today, get().cfg.diet?.snacks, drinksOf(get));
    const skipped: SkippedDay[] = [...r.skipped, ...plan.skipped];
    if (move && plan.skipped.length) return refuse(resultText('Moved', [], skipped));
    const gone = list.find(e => e.id === id)!, at = list.indexOf(gone), copyId = r.copied[0]?.id;
    const done = [...r.copied.map(c => c.day), ...plan.added];
    if (!done.length) return refuse(resultText(move ? 'Moved' : 'Copied', [], skipped));
    if (plan.added.length) putPlan(get, plan.plan); // the plan first: if the log write below never happens, a move leaves the original and a card (a duplicate), never a lost entry
    if (r.copied.length || move) { set({ diet: pruned(r.list, today) }); get().saveDiet(); } // a move to a day ahead drops the original without a copy in the log
    if (move) {
      const toDay = done[0]!, planned = r.planAdds[0]?.item;
      get().noteRemoved('diet', `${gone.n} to ${shortDay(toDay)}`, () => {
        if (get().blocked() || get().diet.some(e => e.id === id) || (copyId && !get().diet.some(e => e.id === copyId))) return false;
        const l = get().diet.filter(e => e.id !== copyId);
        if (!roomOn(l, gone.d)) return false; // the day filled up since: Undo must not push it past the limit
        l.splice(Math.min(at, l.length), 0, gone);
        set({ diet: normDietEntries(l) }); get().saveDiet();
        if (planned) { const p = planOf(get), i = (p[toDay] ?? []).findIndex(x => x.k === planned.k && x.id === planned.id && x.s === planned.s); if (i >= 0) putPlan(get, removeItem(p, toDay, i), skipsAfterLeaving(get, toDay, p[toDay]![i])); }
        return true;
      }, { verb: 'Moved' });
    }
    const message = resultText(move ? 'Moved' : 'Copied', done, skipped);
    return { done, skipped, message, error: null };
  },

  // The planned item at `index` of `day` copied to the same meal of each day in `days`, in one plan write. Days that are full, outside the window or already hold it are skipped and named.
  copyPlanItems(day, index, days) {
    const today = ymd(new Date());
    const r = copyItemToDays(planOf(get), day, index, days, today, get().cfg.diet?.snacks, drinksOf(get));
    if (r.error) return { done: [], skipped: r.skipped, message: r.error, error: r.error };
    putPlan(get, r.plan);
    return { done: r.added, skipped: r.skipped, message: resultText('Copied', r.added, r.skipped), error: null };
  },

  updateDietEntry(id, patch) {
    const list = get().diet; const cur = list.find(e => e.id === id);
    if (!cur) return 'That entry is gone.';
    const merged: Record<string, unknown> = { ...cur, ...patch };
    if (merged.c === null) delete merged.c; // null clears an optional number
    if (merged.f === null) delete merged.f;
    // An explicit `micro` (the typed rows of brief type-food-amounts; null clears) is the person's say. Without one, changed calories mean a changed portion: the amounts would no longer match (the One-off form's rule).
    // The `est` mark says the amounts were estimated from recipe lines; a hand edit of them (or their going away with a changed portion) makes them the person's own (PR 1009 review).
    // The row sheet sends its `micro` on every save, so the mark goes only when the amounts differ from what was stored (review finding 8).
    if (patch.micro !== undefined) { if (!sameMicro(patch.micro, cur.micro)) delete merged.est; if (patch.micro === null) delete merged.micro; }
    else if (patch.kcal !== undefined && patch.kcal !== cur.kcal) { delete merged.micro; delete merged.est; }
    const e = normDietEntry(merged);
    if (!e) return bad();
    set({ diet: list.map(x => (x.id === id ? e : x)) });
    get().saveDiet();
    return null;
  },

  setDietPortion(id, x, max) {
    const cur = get().diet.find(e => e.id === id);
    if (!cur) return 'That entry is gone.';
    const t = entryTotalsAt(cur, x, max);
    if (!t) return 'That portion is out of range.';
    if (t.x === portionBasis(cur).x) return null; // already at that count: nothing to write or save
    return get().updateDietEntry(id, { kcal: t.kcal, p: t.p, c: t.c, f: t.f, micro: t.micro, x: t.x });
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

  addPlanItem(day, kind, id, slot) { return addPlanItemAt(get, day, kind, id, slot).error; },

  // The plate check's one-tap fix: adds the recipe to the meal and marks it planned (the check reads planned food only). Finds the item it just added by looking for it, not by assuming it went last. Returns the message to show: '' when all went well; when the day already holds 8 planned things the food is still added and the text says why it is not marked planned.
  addPlateFix(day, id, slot) {
    const r = addPlanItemAt(get, day, 'r', id, slot);
    if (r.error !== null) return r.error;
    const why = get().setPlanned(day, r.index, true);
    return why ? `Added, not marked planned. ${why}` : '';
  },

  // One recipe or saved meal planned on several days in one plan write (the Add sheet's "This day on" and "Pick days"). Days that are full, outside the window or already hold it are skipped and named.
  addPlanItemToDays(kind, id, days, slot) {
    const there = kind === 'r' ? get().recipes.some(r => r.id === id) : mealsOf(get).some(m => m.id === id);
    const gone = kind === 'r' ? 'That recipe is gone.' : 'That meal is gone.';
    if (!there) return { done: [], skipped: [], message: gone, error: gone };
    const item: PlanItem = { k: kind, id, ...(slot ? { s: slot } : {}) };
    const r = addItemsToDays(planOf(get), [...new Set(days)].map(day => ({ day, item: markedIfRoom(get, day, item) })), ymd(new Date()), get().cfg.diet?.snacks, drinksOf(get));
    if (!r.added.length) { const m = plannedText('', '', [], r.skipped); return { done: [], skipped: r.skipped, message: m, error: m }; }
    putPlan(get, r.plan);
    return { done: r.added, skipped: r.skipped, message: '', error: null };
  },

  movePlanItem(day, index, toDay, slot) {
    const r = moveItem(planOf(get), day, index, toDay, slot, ymd(new Date()), get().cfg.diet?.snacks, drinksOf(get));
    if (r.plan === null) return r.error;
    const was = planOf(get)[day]?.[index];
    putPlan(get, r.plan, toDay !== day ? skipsAfterLeaving(get, day, was) : undefined, repeatSkipsAfter(get, day, was));
    // A recipe moved to another meal of the same day makes that meal the food's usual meal: every other day follows it (owner, 2026-11-18).
    if (toDay === day && slot && was?.k === 'r' && !drinksOf(get).has(was.id) && get().recipes.find(r => r.id === was.id)?.meal !== slot) get().setFoodMeal(was.id, slot);
    return null;
  },

  setFoodMeal(id, meal) {
    if (!get().recipes.some(r => r.id === id)) return 'That food is gone.';
    set({ recipes: get().recipes.map(r => { if (r.id !== id) return r; const { meal: _old, ...rest } = r; return meal ? { ...rest, meal } : rest; }) });
    get().saveRecipes();
    if (meal) get().followFoodMeal(id, meal);
    return null;
  },

  followFoodMeal(id, meal) {
    const plan = planOf(get), next = followFoodMeal(plan, id, meal);
    if (next !== plan) putPlan(get, next);
    // A repeat naming a meal moves with its stored copies (else the repeat shows again in its old meal beside them). A listed daily snack is drawn in the food's usual meal (`snackMealOf`), so it follows without a write.
    const d = get().cfg.diet, reps = d?.repeats, retargeted = reps ? retargetRepeats(reps, id, meal) : undefined;
    if (reps && retargeted !== reps) get().mutateCfg(c => { if (c.diet) c.diet = { ...c.diet, repeats: [...retargeted!] }; });
  },

  setPlanPortion(day, index, portion) {
    const plan = planOf(get), next = setPortion(plan, day, index, portion);
    if (next !== plan) putPlan(get, next);
  },

  // Marks or unmarks a stored item planned (brief nutrition-board-available-list): an error text when the day already holds 8 planned things, else null. Never changes what the day holds.
  setPlanned(day, index, on) {
    const plan = planOf(get), r = markPlanned(plan, day, index, on, get().cfg.diet?.snacks, drinksOf(get));
    if (r.error !== null) return r.error;
    if (r.plan !== plan) putPlan(get, r.plan);
    return null;
  },

  // Plan from a tray row or a card (brief nutrition-planned-available-tray, ADR 146): the food is marked planned on `day` (a shown repeat is stored first, as ticking does), and with `forward` also on the later days it appears (the stored copies and its repeat) in one write. The day's 8 is checked before anything is stored, so a refused Plan leaves the tray as it was. Gives the board's Undo notice.
  planRow(day, ref, forward) {
    const diet = get().cfg.diet, plan0 = planOf(get);
    const full = planFullReason(plan0[day] ?? [], diet?.snacks, drinksOf(get));
    if (full) return { ok: false, message: full };
    let at = ref.index;
    if (at === undefined) {
      if (!ref.rid) return { ok: false, message: 'That is gone.' };
      const r = get().realizeRepeat(day, ref.rid);
      if (typeof r === 'string') return { ok: false, message: r };
      at = r;
    }
    const it = planOf(get)[day]?.[at];
    if (!it) return { ok: false, message: 'That is gone.' };
    const name = resolve(it, get().recipes, mealsOf(get), diet?.mealsMoved).name;
    const today = ymd(new Date()), drinks = drinksOf(get), snacks = diet?.snacks;
    const fp = forward ? planForward(planOf(get), diet?.repeats, day, { k: it.k, id: it.id, s: it.s, rp: ref.rid }, today, snacks, drinks) : { marks: [], full: [], repeat: null, ask: false };
    const out = applyForward(planOf(get), get().cfg.diet?.repeats, fp, day, at, snacks, drinks);
    if (out.error !== null) return { ok: false, message: out.error };
    putPlanAndRepeats(get, out.plan, out.repeats);
    const food: PlanItem = { k: it.k, id: it.id, ...(it.s ? { s: it.s } : {}) }, days = [day, ...fp.marks.map(m => m.day)];
    get().noteRemoved('diet', forward ? `${name} for every future day it appears` : name, () => {
      if (get().blocked()) return false;
      const back = withoutPlanned(planOf(get), get().cfg.diet?.repeats, days, food, fp.repeat);
      putPlanAndRepeats(get, back.plan, back.repeats);
      return true;
    }, { verb: 'Planned', undone: 'Planned undone' });
    return { ok: true, message: forward ? forwardText(name, day, fp) : '' };
  },

  // Unplan: the item moves to the tray (never removed). A shown planned repeat is stored first without the marker (and the repeat skipped that day), so the other days stay planned. Gives the board's Undo notice.
  unplanRow(day, index, rid) {
    const rep = rid ? get().cfg.diet?.repeats?.find(r => r.rid === rid) : undefined;
    const it = rid ? (rep ? repeatPlanItem(rep) : undefined) : planOf(get)[day]?.[index]; // a shown repeat has no stored item yet
    if (!it) return 'That is gone.';
    const name = resolve(it, get().recipes, mealsOf(get), get().cfg.diet?.mealsMoved).name;
    if (rid) { const r = get().realizeRepeat(day, rid); if (typeof r === 'string') return r; } else { const err = get().setPlanned(day, index, false); if (err) return err; }
    const food: PlanItem = { k: it.k, id: it.id, ...(it.s ? { s: it.s } : {}) };
    get().noteRemoved('diet', name, () => {
      if (get().blocked()) return false;
      const now = planOf(get)[day]?.findIndex(i => samePlanItem(i, food)) ?? -1;
      if (now < 0) return false;
      return get().setPlanned(day, now, true) === null; // refused (the day filled up since) leaves it in the tray
    }, { verb: 'Unplanned', undone: 'Planned again' });
    return null;
  },

  // Removing an item that was added from a meal's tray (a handy item, brief nutrition-keep-handy) puts it back in that day's tray: its skip is cleared. Moving it does not.
  removePlanItem(day, index) {
    const it = planOf(get)[day]?.[index], d = get().cfg.diet;
    putPlan(get, removeItem(planOf(get), day, index), skipsAfterLeaving(get, day, it), repeatSkipsAfter(get, day, it) ?? skipsAfterRemovingHandy(d?.repeats, d?.repeatSkips, day, it));
  },

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

  // A listed snack that is only shown becomes a real item of that day's Snack (so it can be ticked, changed or moved); the index of the real item, or an error text (the day is outside the plan window).
  realizeDailySnack(day, id) {
    const meal = snackMealOf(id, get().recipes); // Snack, or the food's usual meal when it has another
    const have = (planOf(get)[day] ?? []).findIndex(i => i.k === 'r' && i.id === id && i.s === meal);
    if (have >= 0) return have;
    const listed = get().cfg.diet?.snacks?.find(x => x.id === id);
    const r = addItem(planOf(get), day, { k: 'r', id, ...(listed?.x ? { x: listed.x } : {}), s: meal }, ymd(new Date()), get().cfg.diet?.snacks, drinksOf(get)); // a listed snack never counts toward the day's 8 planned things, so a full day still lets it be ticked
    if (r.plan === null) return r.error;
    putPlan(get, r.plan);
    return r.plan[day]!.length - 1;
  },

  // Takes back a snack realizeDailySnack just stored when what it was stored for did not happen (the log failed): it has no eaten mark, so it only goes back to being shown.
  unstoreDailySnack(day, index) {
    const it = planOf(get)[day]?.[index];
    if (!it || it.e?.length) return;
    putPlan(get, removeItem(planOf(get), day, index));
  },

  // Repeats (brief nutrition-meal-labels-year-repeat): cfg.diet.repeats, each stored once and shown on its weekdays of every week in the plan window.
  // Saving one from a planned item on `day` starts it that day (no back-fill); `rid` edits the days of a repeat already there.
  saveRepeat(day, item, days, rid, handy) {
    const r = saveRepeat(pruneHandy(get().cfg.diet?.repeats ?? [], get().recipes), { ...(rid ? { rid } : {}), item, days, from: handy ? ymd(new Date()) : day, ...(handy ? { handy: true } : {}) });
    if (r.list === null) return r.error;
    get().mutateCfg(c => {
      const next = { ...(c.diet || {}), repeats: r.list };
      const skips = dropRepeatSkips(next.repeatSkips, r.list);
      if (Object.keys(skips).length) next.repeatSkips = skips; else delete next.repeatSkips;
      const clean = normDietCfg(next, ymd(new Date()));
      if (clean) c.diet = clean; else delete c.diet;
    });
    return null;
  },

  // Stop repeating: the repeat and its skips go, on every day. Items already stored on a day stay.
  stopRepeat(rid) {
    get().mutateCfg(c => {
      const left = removeRepeat(c.diet?.repeats ?? [], rid), next = { ...(c.diet || {}) };
      if (left.length) next.repeats = left; else delete next.repeats;
      const skips = dropRepeatSkips(next.repeatSkips, left);
      if (Object.keys(skips).length) next.repeatSkips = skips; else delete next.repeatSkips;
      const clean = normDietCfg(next, ymd(new Date()));
      if (clean) c.diet = clean; else delete c.diet;
    });
  },

  // A recipe or meal that is deleted takes its repeats (and their skips) with it; the removed repeats are handed back so Undo of the delete can restore them.
  dropRepeatsFor(id) {
    const gone = (get().cfg.diet?.repeats ?? []).filter(r => r.id === id);
    if (!gone.length) return [];
    get().mutateCfg(c => {
      const left = removeRepeatsFor(c.diet?.repeats ?? [], id), next = { ...(c.diet || {}) };
      if (left.length) next.repeats = left; else delete next.repeats;
      const skips = dropRepeatSkips(next.repeatSkips, left);
      if (Object.keys(skips).length) next.repeatSkips = skips; else delete next.repeatSkips;
      const clean = normDietCfg(next, ymd(new Date()));
      if (clean) c.diet = clean; else delete c.diet;
    });
    return gone;
  },
  restoreRepeats(list) {
    if (!list.length) return;
    get().mutateCfg(c => {
      const have = c.diet?.repeats ?? [], next = { ...(c.diet || {}), repeats: [...have, ...list.filter(r => !have.some(h => h.rid === r.rid))] };
      const clean = normDietCfg(next, ymd(new Date()));
      if (clean) c.diet = clean; else delete c.diet;
    });
  },

  // Plate hints (brief nutrition-plate-hints-per-meal): the setting per meal, and a one-day dismissal. Both go back through normDietCfg, which also drops past days.
  setPlateHint(slot, on) {
    get().mutateCfg(c => {
      const hintsOff = withHintSwitch(c.diet?.hintsOff, slot, on), next = { ...(c.diet || {}) };
      if (hintsOff.length) next.hintsOff = hintsOff; else delete next.hintsOff;
      const clean = normDietCfg(next, ymd(new Date()));
      if (clean) c.diet = clean; else delete c.diet;
    });
  },
  dismissPlateHint(day, slot) {
    get().mutateCfg(c => {
      const have = c.diet?.hintSkips ?? {}, next = { ...(c.diet || {}), hintSkips: { ...have, [day]: [...(have[day] ?? []).filter(s => s !== slot), slot] } };
      const clean = normDietCfg(next, ymd(new Date()));
      if (clean) c.diet = clean; else delete c.diet;
    });
  },

  // Skip this day only: the repeat is not shown on that day and shows on the others.
  skipRepeatDay(day, rid) { putPlan(get, planOf(get), undefined, skipRepeat(get().cfg.diet?.repeatSkips, day, rid)); },

  // A repeat that is only shown becomes a real item of that day (so it can be ticked, changed or moved) and the repeat is skipped that day, so moving or removing the item does not bring the repeat back; the index of the real item, or an error text (the day is full or outside the window).
  realizeRepeat(day, rid) {
    const rep = get().cfg.diet?.repeats?.find(r => r.rid === rid);
    if (!rep) return 'That repeat is gone.';
    // The same cap rule as any add (`addItem`), which is also what the plan cleaner keeps: when the day cannot hold the item the repeat is refused here, before anything is skipped or stored, so it never vanishes.
    const r = addItem(planOf(get), day, { k: rep.k, id: rep.id, ...(rep.x ? { x: rep.x } : {}), ...(rep.s ? { s: rep.s } : {}) }, ymd(new Date()), get().cfg.diet?.snacks, drinksOf(get));
    if (r.plan === null) return rep.h ? r.error : `${r.error} Skip the repeat on this day to free the spot.`; // a handy item just stays in the tray
    putPlan(get, r.plan, undefined, skipRepeat(get().cfg.diet?.repeatSkips, day, rid));
    return r.plan[day]!.length - 1;
  },

  // Takes back an item realizeRepeat just stored when what it was stored for did not happen (the log failed): it goes back to being shown.
  unstoreRepeat(day, index, rid) {
    const it = planOf(get)[day]?.[index];
    if (!it || it.e?.length) return;
    putPlan(get, removeItem(planOf(get), day, index), undefined, unskipRepeat(get().cfg.diet?.repeatSkips, day, rid));
  },

  setPlanEaten(day, index, ids) { putPlan(get, setEaten(planOf(get), day, index, ids)); },

  // Week to Shopping (briefs week-shopping, snacks-into-shopping): each planned, uneaten recipe on those days, and each listed daily snack that shows there, puts its missing ingredients on Shopping through the recipe's own button; `ids` are the items this call created, for Undo.
  planToShopping(days, month = monthKey(new Date()), today = ymd(new Date())) {
    const recipeIds = plannedShoppingIds(get().cfg.diet, days, today, get().recipes, get().diet), before = get().grocery.items;
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
