import { PLAN_SLOTS, isDailySnackItem, isDrinkItem, samePlanItem } from '../shared/diet.js';
import type { DailySnack, PlanItem, PlanSlot, PlateMark, Recipe, SavedMeal } from '../types.ts';
import { resultText, type SkippedDay } from './dayPicker.js';
import { fullReason, inWindow, resolve, type Plan, type Resolved } from './dietPlan.js';
import { servingNumbers } from './dietLog.js';
import { SLOT_SHARE, fatBarState, fatCoverage, marksOf, plateCheck } from './plate.js';
import { pairsOf } from './recipePairs.js';
import { drinkIdsOf } from './recipeUses.js';
import { sortByName } from './sort.js';
import { mealOfItem } from './usualMeal.js';

/* ---------- The week board (brief week-board): what one day looks like as four meals, with its bars and plate checks, and the moves between meals and days. Pure; the board draws it. ---------- */

export const SLOT_LABEL: Record<PlanSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
export const MARK_LABEL: Record<PlateMark, string> = { protein: 'Protein', carb: 'Carb', veg: 'Veg' };

/** `virtual` is a listed daily snack shown on this day but not stored (brief daily-snacks): ticking, changing or moving it stores a real item first. */
export interface BoardItem { index: number; r: Resolved; fat: number | undefined; virtual?: true }
/** One meal of a day. `slot` null is the group of items with no meal set. `fixes` are the one-tap additions for what the meal lacks. */
export interface BoardSlot { slot: PlanSlot | null; items: BoardItem[]; kcal: number; share: number | null; need: readonly PlateMark[]; have: PlateMark[]; fixes: { mark: PlateMark; recipe: Recipe; why: string | null }[] }
export interface BoardDay { day: string; count: number; kcal: number; protein: number; fat: number; fatState: 'full' | 'partial' | 'hidden'; fatFoods: { known: number; all: number }; slots: BoardSlot[]; /** The day's drinks (brief nutrition-meal-labels-year-repeat): outside every meal, the plate check and the 8-item cap; their calories still count in the day's totals. */ drinks: BoardItem[] }

const round1 = (n: number) => Math.round(n * 10) / 10;

function fatOf(r: Resolved): number | undefined {
  if (r.gone) return undefined;
  if (r.meal) return r.meal.items.every(i => i.f !== undefined) ? r.meal.items.reduce((a, i) => a + i.f!, 0) : undefined;
  const nums = r.recipe ? servingNumbers(r.recipe, r.portion) : null;
  return nums?.f;
}

/** A partner of the meal's foods that covers `mark` (from Goes with first), else your first recipe that covers it, favorites first then A to Z. Never something already in the meal. */
export function fixFor(mark: PlateMark, inMeal: readonly Recipe[], recipes: readonly Recipe[]): { recipe: Recipe; why: string | null } | null {
  const have = new Set(inMeal.map(r => r.id));
  for (const food of inMeal) {
    const partner = pairsOf(food, recipes).find(p => !have.has(p.id) && marksOf(p, recipes).includes(mark));
    if (partner) return { recipe: partner, why: `goes with ${food.n}` };
  }
  const pool = sortByName(recipes.filter(r => !have.has(r.id) && marksOf(r, recipes).includes(mark) && r.kcal !== undefined && r.p !== undefined && r.cat !== 'sauces' && r.cat !== 'seasonings'), r => r.n, r => r.id);
  const pick = pool.find(r => r.fav) ?? pool[0];
  return pick ? { recipe: pick, why: null } : null;
}

/** One day of the plan as meals: an item with no meal of its own sits in its recipe's usual meal (`mealOfItem`), a drink in the Drinks list; each item with its numbers, each meal with its calories against its share of the target, its plate check and fixes, and the day's three totals. */
export function boardDay(plan: Plan, day: string, recipes: Recipe[], meals: SavedMeal[], kcalTarget: number | null, moved: Readonly<Record<string, string>> = {}): BoardDay {
  const items = plan[day] ?? [];
  const rows: BoardItem[] = items.map((it, index) => { const r = resolve(it, recipes, meals, moved); return { index, r, fat: fatOf(r), ...(it.v ? { virtual: true as const } : {}) }; });
  const live = rows.filter(x => !x.r.gone);
  const sum = (pick: (x: BoardItem) => number | undefined) => round1(live.reduce((a, x) => a + (pick(x) ?? 0), 0));
  const foods = live.map(x => ({ r: { ...(x.r.kcal !== undefined ? { kcal: x.r.kcal } : {}), ...(x.fat !== undefined ? { f: x.fat } : {}) }, x: 1 }));
  const drinkIds = drinkIdsOf(recipes);
  const isDrink = (x: BoardItem) => isDrinkItem(x.r.item, drinkIds);
  const drinks = rows.filter(isDrink);
  const meal = rows.filter(x => !isDrink(x));
  const slots: BoardSlot[] = [];
  const order: (PlanSlot | null)[] = [null, ...PLAN_SLOTS];
  for (const slot of order) {
    const here = meal.filter(x => (mealOfItem(x.r.item, recipes) ?? null) === slot);
    if (slot === null && here.length === 0) continue;
    const foodsHere = here.flatMap(x => (x.r.recipe ? [x.r.recipe] : []));
    const chk = slot && !here.some(x => x.r.meal) ? plateCheck(slot, foodsHere, recipes) : { need: [] as readonly PlateMark[], have: [] as PlateMark[], missing: [] as PlateMark[] };
    const fixes = chk.missing.flatMap(mark => { const f = fixFor(mark, foodsHere, recipes); return f ? [{ mark, ...f }] : []; });
    slots.push({ slot, items: here, kcal: Math.round(here.reduce((a, x) => a + (x.r.gone ? 0 : x.r.kcal ?? 0), 0)), share: slot && kcalTarget ? Math.round(kcalTarget * SLOT_SHARE[slot]) : null, need: chk.need, have: chk.have, fixes });
  }
  return {
    day, count: items.length, kcal: Math.round(sum(x => x.r.kcal)), protein: sum(x => x.r.p), fat: sum(x => x.fat),
    fatState: fatBarState(fatCoverage(foods)), fatFoods: { known: live.filter(x => x.fat !== undefined).length, all: live.length }, slots, drinks,
  };
}

type Moved = { plan: Plan; error: null } | { plan: null; error: string };

/** `plan` with the item at `index` of `fromDay` moved to meal `slot` of `toDay` (the same day changes only its meal). An error text when the day is outside the window or full, or the food is already in that meal. */
export function moveItem(plan: Plan, fromDay: string, index: number, toDay: string, slot: PlanSlot | undefined, today: string, snacks?: readonly DailySnack[], drinks?: ReadonlySet<string>): Moved {
  const it = plan[fromDay]?.[index];
  if (!it) return { plan: null, error: 'That is gone.' };
  if (!inWindow(toDay, today)) return { plan: null, error: 'You can plan today and the next 52 weeks.' };
  const { s: _old, ...rest } = it;
  const moved: PlanItem = { ...rest, ...(slot ? { s: slot } : {}) };
  if (toDay !== fromDay) delete moved.e; // eaten belongs to the day it was checked on
  const target = (plan[toDay] ?? []).filter((_, i) => !(toDay === fromDay && i === index));
  if (target.some(x => samePlanItem(x, moved))) return { plan: null, error: 'That is already in that meal.' }; // the same rule as addItem: the same food may be in two meals of a day, never twice in one
  const counted = (x: PlanItem) => !isDailySnackItem(x, snacks) && !isDrinkItem(x, drinks); // a listed daily snack in Snack and a drink never count toward MAX_PLAN_ITEMS (briefs snacks-day-cap, nutrition-meal-labels-year-repeat); moving one into another meal makes it a planned thing
  const rejoin = toDay !== fromDay || (counted(moved) && !counted(it));
  const full = rejoin ? fullReason(target, moved, snacks, drinks) : null;
  if (full) return { plan: null, error: full };
  const from = (plan[fromDay] ?? []).filter((_, i) => i !== index);
  const next: Plan = { ...plan };
  if (toDay === fromDay) next[toDay] = (plan[toDay] ?? []).map((x, i) => (i === index ? moved : x));
  else { if (from.length) next[fromDay] = from; else delete next[fromDay]; next[toDay] = [...target, moved]; }
  return { plan: next, error: null };
}

export interface ManyPlanResult { plan: Plan; added: string[]; skipped: SkippedDay[] }

/** Why `item` can't be added to `day` of `plan` (the `addItem` rules, as a short reason), or null. */
function addReject(plan: Plan, day: string, item: PlanItem, today: string, snacks?: readonly DailySnack[], drinks?: ReadonlySet<string>): string | null {
  if (!inWindow(day, today)) return 'out of reach';
  const list = plan[day] ?? [];
  if (list.some(i => samePlanItem(i, item))) return 'already there';
  return fullReason(list, item, snacks, drinks) ? 'full' : null;
}

/** `plan` with each `{ day, item }` added (several cards for several days, or the same card on several days). A day that is full, outside the window or already holds that food in that meal is skipped and named; the rest are added. Never throws; an all-skipped batch returns the plan unchanged. */
export function addItemsToDays(plan: Plan, adds: readonly { day: string; item: PlanItem }[], today: string, snacks?: readonly DailySnack[], drinks?: ReadonlySet<string>): ManyPlanResult {
  let next = plan;
  const added: string[] = [], skipped: SkippedDay[] = [];
  for (const { day, item } of adds) {
    const why = addReject(next, day, item, today, snacks, drinks);
    if (why) { skipped.push({ day, reason: why }); continue; }
    next = { ...next, [day]: [...(next[day] ?? []), item] };
    added.push(day);
  }
  return { plan: next, added, skipped };
}

/** Copy the planned item at `index` of `fromDay` to the same meal of each of `toDays` (the portion and meal kept, the eaten ticks left behind). The source's own day is skipped; `error` is set when the item is gone or nothing could be added. */
export function copyItemToDays(plan: Plan, fromDay: string, index: number, toDays: readonly string[], today: string, snacks?: readonly DailySnack[], drinks?: ReadonlySet<string>): ManyPlanResult & { error: string | null } {
  const it = plan[fromDay]?.[index];
  if (!it) return { plan, added: [], skipped: [], error: 'That is gone.' };
  const { e: _eaten, v: _virtual, ...item } = it;
  const days = [...new Set(toDays)];
  const own: SkippedDay[] = days.includes(fromDay) ? [{ day: fromDay, reason: 'its own day' }] : [];
  const r = addItemsToDays(plan, days.filter(d => d !== fromDay).map(day => ({ day, item })), today, snacks, drinks);
  const skipped = [...own, ...r.skipped];
  return { ...r, skipped, error: r.added.length ? null : resultText('Copied', [], skipped) };
}
