import { MAX_HANDY, MAX_PLAN_ITEMS, MAX_REPEATS, PLAN_SLOTS, isDrinkItem, samePlanItem } from '../shared/diet.js';
import { parseDate } from '../shared/dates.js';
import type { PlanItem, PlanSlot, Recipe, RepeatItem, SavedMeal } from '../types.ts';
import { inWindow, resolve, type Plan, type Resolved } from './dietPlan.js';
import { drinkIdsOf } from './recipeUses.js';
import { nameCmp } from './sort.js';
import { mealOfItem } from './usualMeal.js';

/* ---------- Repeats (brief nutrition-meal-labels-year-repeat): an item stored once and shown on chosen weekdays of every week in the plan window. Pure; the store writes the list and the board draws what shows. ---------- */

/** The item a repeat shows as on a day: marked `v` (never stored) and `rp` (which repeat), so a tap can skip it for that day. A planned repeat (`p`) shows as planned (`planned`, false when the day has no room left, see `withRepeats`). */
export const repeatPlanItem = (r: RepeatItem, planned: boolean = r.p === true): PlanItem => ({ k: r.k, id: r.id, ...(r.x ? { x: r.x } : {}), ...(r.s ? { s: r.s } : {}), ...(planned ? { p: true as const } : {}), v: true, rp: r.rid });

/** Whether a repeat is kept handy (brief nutrition-keep-handy): shown in its meal's tray, never on the day's card. */
export const isHandy = (r: RepeatItem): boolean => r.h === true;

/** The repeats of one display mode that apply on `day`: the day is in the plan window (today to the last plannable day, so never a past day or one beyond the window), on or after the repeat's start day, on one of its weekdays, not skipped that day, and not already there as a stored item (the same food in the same meal; the stored one wins). */
function activeOn(day: string, plan: Plan, repeats: readonly RepeatItem[] | undefined, skips: Readonly<Record<string, string[]>> | undefined, today: string, handy: boolean): RepeatItem[] {
  if (!repeats?.length || !inWindow(day, today)) return [];
  const weekday = parseDate(day).getDay(), real = plan[day] ?? [], skipped = skips?.[day] ?? [];
  const shown = repeats.filter(r => isHandy(r) === handy && day >= r.from && r.days.includes(weekday) && !skipped.includes(r.rid) && !real.some(i => samePlanItem(i, { k: r.k, id: r.id, ...(r.s ? { s: r.s } : {}) })));
  return shown.filter((r, n) => !shown.slice(0, n).some(e => samePlanItem({ k: e.k, id: e.id, s: e.s }, { k: r.k, id: r.id, s: r.s }))); // two repeats of the same food in the same meal show once
}

/** The repeats that show on `day`'s card. Handy ones are left out: they wait in the tray (`handyOn`). */
export const repeatsShownOn = (day: string, plan: Plan, repeats: readonly RepeatItem[] | undefined, skips: Readonly<Record<string, string[]>> | undefined, today: string): RepeatItem[] => activeOn(day, plan, repeats, skips, today, false);

/** The handy items waiting on `day` (same rules as `repeatsShownOn`): not on the card, not in the day's totals, until one is added. */
export const handyOn = (day: string, plan: Plan, repeats: readonly RepeatItem[] | undefined, skips: Readonly<Record<string, string[]>> | undefined, today: string): RepeatItem[] => activeOn(day, plan, repeats, skips, today, true);

/** The meal whose tray holds a handy item: its own meal, else the food's usual meal, else the first meal of the day. */
export const trayMealOf = (r: RepeatItem, recipes: readonly Pick<Recipe, 'id' | 'meal'>[]): PlanSlot => mealOfItem(r, recipes) ?? PLAN_SLOTS[0]!;

export interface HandyRow { r: RepeatItem; res: Resolved }

/** Each meal's tray on `day`: the handy items waiting there, A to Z, with their numbers as they would be added. A drink or a food that is gone is left out; a meal with nothing waiting is not a key. */
export function handyTrays(day: string, plan: Plan, repeats: readonly RepeatItem[] | undefined, skips: Readonly<Record<string, string[]>> | undefined, today: string, recipes: Recipe[], meals: SavedMeal[], moved: Readonly<Record<string, string>> = {}): Partial<Record<PlanSlot, HandyRow[]>> {
  const out: Partial<Record<PlanSlot, HandyRow[]>> = {}, drinks = drinkIdsOf(recipes);
  for (const r of handyOn(day, plan, repeats, skips, today)) {
    const res = resolve(repeatPlanItem(r), recipes, meals, moved);
    if (res.gone || isDrinkItem({ k: r.k, id: r.id }, drinks)) continue;
    (out[trayMealOf(r, recipes)] ??= []).push({ r, res });
  }
  for (const rows of Object.values(out)) rows.sort(nameCmp((x: HandyRow) => x.res.name, x => x.r.rid));
  return out;
}

/** `plan` with each day's shown repeats added after its stored items. The same object when nothing is added, so memos hold. A planned repeat shows as planned only while the day holds fewer than MAX_PLAN_ITEMS planned things; the rest of them show as Available (brief nutrition-planned-available-tray: a day at 8 draws it in the tray, so the cap holds for shown items too). */
export function withRepeats(plan: Plan, repeats: readonly RepeatItem[] | undefined, skips: Readonly<Record<string, string[]>> | undefined, days: readonly string[], today: string): Plan {
  if (!repeats?.length) return plan;
  let out: Plan | null = null;
  for (const day of days) {
    const shown = repeatsShownOn(day, plan, repeats, skips, today);
    if (!shown.length) continue;
    let room = MAX_PLAN_ITEMS - (plan[day] ?? []).filter(i => i.p === true).length;
    (out ??= { ...plan })[day] = [...(plan[day] ?? []), ...shown.map(r => { const planned = r.p === true && room > 0; if (planned) room--; return repeatPlanItem(r, planned); })];
  }
  return out ?? plan;
}

type Edit = { list: RepeatItem[]; error: null } | { list: null; error: string };

/** `list` with `item` added. An error text when the list is full or that repeat (same `rid`, or the same food in the same meal on the same days) is already there. */
const CLASH = 'That already repeats on some of those days.', CLASH_HANDY = 'That food is already kept handy or repeats for that meal.';

/** The error for a clash between two repeats: a handy item uses every day, so it clashes with any repeat of the same food and meal. */
const clashText = (a: RepeatItem | undefined, b: { h?: true } | undefined): string => (a && isHandy(a)) || b?.h === true ? CLASH_HANDY : CLASH;

/** `list` without the handy items that can no longer show (a drink now, or a food that is gone), so they stop counting toward the cap with nothing to remove. The same array when none. */
export function pruneHandy(list: readonly RepeatItem[], recipes: readonly Pick<Recipe, 'id' | 'uses' | 'cat'>[]): readonly RepeatItem[] {
  const drinks = drinkIdsOf(recipes as Recipe[]), kept = list.filter(r => !isHandy(r) || (r.k === 'r' && recipes.some(x => x.id === r.id) && !isDrinkItem({ k: r.k, id: r.id }, drinks)));
  return kept.length === list.length ? list : kept;
}

export function addRepeat(list: readonly RepeatItem[], item: RepeatItem): Edit {
  if (isHandy(item) ? list.filter(isHandy).length >= MAX_HANDY : list.filter(r => !isHandy(r)).length >= MAX_REPEATS) return { list: null, error: isHandy(item) ? `You can keep ${MAX_HANDY} foods handy.` : `You can keep ${MAX_REPEATS} repeats.` };
  const clash = list.find(r => r.rid === item.rid || (samePlanItem({ k: r.k, id: r.id, s: r.s }, { k: item.k, id: item.id, s: item.s }) && r.days.some(d => item.days.includes(d))));
  if (clash) return { list: null, error: clashText(clash, item) };
  return { list: [...list, item], error: null };
}

/** `list` without any repeat of the recipe or meal `id`. */
export const removeRepeatsFor = (list: readonly RepeatItem[], id: string): RepeatItem[] => list.filter(r => r.id !== id);

/** `list` without the repeat `rid` (its skips are cleaned by `dropRepeatSkips`). */
export const removeRepeat = (list: readonly RepeatItem[], rid: string): RepeatItem[] => list.filter(r => r.rid !== rid);

/** The skips with the repeat `rid` skipped on `day` only. */
export function skipRepeat(skips: Readonly<Record<string, string[]>> | undefined, day: string, rid: string): Record<string, string[]> {
  const cur = skips?.[day] ?? [];
  return cur.includes(rid) ? { ...skips } : { ...skips, [day]: [...cur, rid] };
}

/** The skips without any that name a repeat no longer in `list` (so removing a repeat removes its skips too). */
export function dropRepeatSkips(skips: Readonly<Record<string, string[]>> | undefined, list: readonly RepeatItem[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [d, ids] of Object.entries(skips ?? {})) {
    const kept = ids.filter(id => list.some(r => r.rid === id));
    if (kept.length) out[d] = kept;
  }
  return out;
}

/* ---------- The Repeat sheet's rules: which days a choice means, what they are called, and the edits a tap makes ---------- */

/** Weekdays as stored: 0 Sunday to 6 Saturday. The sheet lists them Monday first. */
export const EVERY_DAY: readonly number[] = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];
export const DAY_BUTTONS: readonly { day: number; letter: string; name: string }[] = [
  { day: 1, letter: 'M', name: 'Monday' }, { day: 2, letter: 'T', name: 'Tuesday' }, { day: 3, letter: 'W', name: 'Wednesday' }, { day: 4, letter: 'T', name: 'Thursday' },
  { day: 5, letter: 'F', name: 'Friday' }, { day: 6, letter: 'S', name: 'Saturday' }, { day: 0, letter: 'S', name: 'Sunday' },
];

/** `days` with `day` ticked or unticked, in weekday order (Sunday first, as stored). */
export const toggleWeekday = (days: readonly number[], day: number): number[] => (days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort((a, b) => a - b));

/** Whether two day lists are the same set. */
export const sameDays = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every(d => b.includes(d));

/** "Every day", "Weekdays", or the days named: "Mon, Wed, Sat". */
export function daysName(days: readonly number[]): string {
  if (sameDays(days, EVERY_DAY)) return 'Every day';
  if (sameDays(days, WEEKDAYS)) return 'Weekdays';
  return DAY_BUTTONS.filter(b => days.includes(b.day)).map(b => b.name.slice(0, 3)).join(', ');
}

/** A name for a new repeat that no repeat in `list` has. */
export function newRid(list: readonly RepeatItem[]): string {
  for (let n = list.length + 1; ; n++) if (!list.some(r => r.rid === `rp${n}`)) return `rp${n}`;
}

/** `list` with a repeat saved: a repeat that already has `rid` takes the new days (and the handy choice: `handy` keeps it in its meal's tray on every day, from the earlier of its start and `from`; off, it is a plain repeat again); otherwise the item is added as a new repeat from `from` (the day it was set on). An error text for no days, a full list (12 repeats, 24 handy, counted apart) or a repeat that is already there. */
export function saveRepeat(list: readonly RepeatItem[], spec: { rid?: string; item: { k: 'r' | 'm'; id: string; x?: number; s?: PlanSlot }; days: readonly number[]; from: string; handy?: boolean }): Edit {
  const handy = spec.handy === true, days = [...new Set(handy ? EVERY_DAY : spec.days)].sort((a, b) => a - b);
  if (!days.length) return { list: null, error: 'Pick at least one day.' };
  if (spec.rid && list.some(r => r.rid === spec.rid)) {
    const me = list.find(r => r.rid === spec.rid)!;
    const meal = handy ? me.s ?? spec.item.s : me.s;
    const clash = list.find(r => r.rid !== me.rid && samePlanItem({ k: r.k, id: r.id, s: r.s }, { k: me.k, id: me.id, s: meal }) && r.days.some(d => days.includes(d)));
    if (clash) return { list: null, error: clashText(clash, handy ? { h: true } : undefined) };
    const { h: _was, p: _planned, ...rest } = me;
    const next: RepeatItem = { ...rest, ...(!handy && me.p ? { p: true as const } : {}), days, ...(meal ? { s: meal } : {}), ...(handy ? { h: true as const, from: spec.from < me.from ? spec.from : me.from } : {}) };
    const out = list.map(r => (r.rid === spec.rid ? next : r));
    if (handy !== isHandy(me) && (handy ? out.filter(isHandy).length > MAX_HANDY : out.filter(r => !isHandy(r)).length > MAX_REPEATS)) return { list: null, error: handy ? `You can keep ${MAX_HANDY} foods handy.` : `You can keep ${MAX_REPEATS} repeats.` };
    return { list: out, error: null };
  }
  const { k, id, x, s } = spec.item;
  return addRepeat(list, { rid: newRid(list), k, id, ...(x && x !== 1 ? { x } : {}), ...(s ? { s } : {}), days, from: spec.from, ...(handy ? { h: true as const } : {}) });
}

/** The skips with the handy item of `item`'s food and meal, if one stands for it on `day`, shown in the tray again: taking an item that was added from the tray off the plate (Remove) puts it back in that day's tray. undefined when no handy item is skipped there for it. */
export function skipsAfterRemovingHandy(repeats: readonly RepeatItem[] | undefined, skips: Readonly<Record<string, string[]>> | undefined, day: string, item: { k: string; id: string; s?: PlanSlot } | undefined): Record<string, string[]> | undefined {
  if (!item) return undefined;
  const skipped = skips?.[day] ?? [];
  const r = repeats?.find(x => isHandy(x) && skipped.includes(x.rid) && samePlanItem(item as PlanItem, { k: x.k, id: x.id, ...(x.s ? { s: x.s } : {}) }));
  return r ? unskipRepeat(skips, day, r.rid) : undefined;
}

/** The skips with the repeat that a stored item on `day` stands for skipped there: only the item a repeat was made from (the repeat's start day), since an item the person added by hand on a later day is their own and the repeat shows again where it was (an item realized from a repeat already has its skip). Taking the item off its place (removing it, moving it to another meal or day) does not bring the repeat back in its spot. The skips unchanged (undefined) when the item stands for no repeat that shows on that day. */
export function skipsAfterLeaving(repeats: readonly RepeatItem[] | undefined, skips: Readonly<Record<string, string[]>> | undefined, day: string, item: { k: string; id: string; s?: PlanSlot } | undefined): Record<string, string[]> | undefined {
  if (!item || !repeats?.length) return undefined;
  const weekday = parseDate(day).getDay();
  const r = repeats.find(x => !isHandy(x) && samePlanItem(item as PlanItem, { k: x.k, id: x.id, ...(x.s ? { s: x.s } : {}) }) && day === x.from && x.days.includes(weekday) && !(skips?.[day] ?? []).includes(x.rid));
  return r ? skipRepeat(skips, day, r.rid) : undefined;
}

/** The skips with the repeat `rid` shown again on `day`. */
export function unskipRepeat(skips: Readonly<Record<string, string[]>> | undefined, day: string, rid: string): Record<string, string[]> {
  const out: Record<string, string[]> = { ...skips };
  const kept = (out[day] ?? []).filter(x => x !== rid);
  if (kept.length) out[day] = kept; else delete out[day];
  return out;
}

/** The repeat a planned item stands for: the same food in the same meal, by `rid` when the item is a shown repeat. */
export function repeatFor(list: readonly RepeatItem[] | undefined, item: { k: string; id: string; s?: PlanSlot; rp?: string }, day?: string): RepeatItem | undefined {
  if (item.rp) return list?.find(r => r.rid === item.rp);
  const weekday = day ? parseDate(day).getDay() : undefined; // with the day, only a repeat that shows there stands for the item
  return list?.find(r => samePlanItem(item as PlanItem, { k: r.k, id: r.id, ...(r.s ? { s: r.s } : {}) }) && (!day || (day >= r.from && r.days.includes(weekday!))));
}

/** The sentence under the Keep handy choice. */
export const handySummary = (meal: string): string => `Kept handy for ${meal}. It waits in the Available tray: Plan it or tick Ate.`;

/** The meal a food is kept handy for from the sheet: the card's own meal, else its usual meal, else the first meal of the day. */
export const handyMealFor = (item: { k: 'r' | 'm'; id: string; s?: PlanSlot }, recipes: readonly Pick<Recipe, 'id' | 'meal'>[]): PlanSlot => mealOfItem(item, recipes) ?? PLAN_SLOTS[0]!;

/** The sentence under the day ticks: what the choice means. */
export function repeatSummary(days: readonly number[], meal: string, fromName: string): string {
  if (!days.length) return 'Pick at least one day.';
  return `${daysName(days)} in ${meal}, every week from ${fromName} for the next 52 weeks. Nothing is copied: change or stop it here.`;
}

/** `list` with every repeat of the recipe `id` that names a meal moved to `meal`, so the repeat keeps matching the stored copies that moved with it (a stored item stands for a repeat when food and meal match). A repeat is left alone when moving it would clash with another repeat of the same food in that meal on a shared weekday (including one moved earlier in the same call). The same array when nothing changed. */
export function retargetRepeats(list: readonly RepeatItem[], id: string, meal: PlanSlot): readonly RepeatItem[] {
  const out = [...list]; // the clash is checked against the repeats as already moved in this pass, so two repeats that would overlap in `meal` do not both move
  let changed = false;
  out.forEach((r, i) => {
    if (r.k !== 'r' || r.id !== id || !r.s || r.s === meal) return;
    const moved = { ...r, s: meal };
    if (out.some(o => o !== r && o.rid !== r.rid && samePlanItem({ k: o.k, id: o.id, ...(o.s ? { s: o.s } : {}) }, { k: moved.k, id: moved.id, s: meal }) && o.days.some(d => moved.days.includes(d)))) return;
    out[i] = moved;
    changed = true;
  });
  return changed ? out : list;
}
