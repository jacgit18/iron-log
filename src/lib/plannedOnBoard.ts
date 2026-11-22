import type { PlanSlot, Recipe, RepeatItem } from '../types.ts';
import { parseDate } from '../shared/dates.js';
import { daysFrom, isEaten, type Plan } from './dietPlan.js';
import { withRepeats } from './repeats.js';
import { mealOfItem } from './usualMeal.js';

/* ---------- The planned marker on Foods (brief foods-made-and-store-bought, PR 3): which foods the Nutrition board has planned in the next 7 days. Read from the board's plan (stored items marked `p`, planned repeats, saved meals as the recipe they became); nothing is stored. Pure; the Foods list and a food's page draw it. ---------- */

/** The window: today and the six days after it. */
export const PLANNED_DAYS = 7;

/** One planned spot: the day, and the meal it sits in (none when the item and its food name no meal). */
export interface PlannedSpot { day: string; slot?: PlanSlot }

const rank = (s: PlannedSpot): number => (s.slot ? SLOT_ORDER.indexOf(s.slot) : SLOT_ORDER.length);

/** What the plan is read from: the board's stored plan, its repeats and their skips, and the saved-meal to recipe record (`mealsMoved`). */
export interface PlanSource { plan?: Plan | undefined; repeats?: readonly RepeatItem[] | undefined; repeatSkips?: Readonly<Record<string, string[]>> | undefined; moved?: Readonly<Record<string, string>> | undefined }

/** Each recipe id to where the board has it planned in the window, earliest first. */
export type PlannedIndex = ReadonlyMap<string, readonly PlannedSpot[]>;

const SLOT_ORDER: readonly PlanSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** What the board has planned in the next 7 days, by recipe id. Counts an item marked planned (`p`), stored or shown from a repeat (a repeat the day has no room for shows as Available, so it does not count); a saved meal counts as the recipe it became (`moved`), and one still held back is no food here. A ticked item (one of its entries is still in `entries`) is eaten, so it does not count. A past day, a listed daily snack, a Keep handy food and an unplanned item never count. The same recipe in two meals on a day is two spots. */
export function plannedIndex(src: PlanSource, entries: readonly { id: string }[], recipes: readonly Pick<Recipe, 'id' | 'meal'>[], today: string): PlannedIndex {
  const out = new Map<string, PlannedSpot[]>();
  const moved = src.moved ?? {};
  const days = daysFrom(today, PLANNED_DAYS), shown = withRepeats(src.plan ?? {}, src.repeats, src.repeatSkips, days, today);
  for (const day of days) {
    for (const it of shown[day] ?? []) {
      if (it.p !== true || isEaten(it, entries)) continue;
      const id = it.k === 'r' ? it.id : moved[it.id];
      if (!id) continue;
      const slot = mealOfItem({ k: 'r', id, ...(it.s ? { s: it.s } : {}) }, recipes); // a saved meal follows the recipe it became
      const list = out.get(id) ?? [];
      if (!list.some(s => s.day === day && s.slot === slot)) list.push({ day, ...(slot ? { slot } : {}) });
      out.set(id, list);
    }
  }
  for (const list of out.values()) list.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : rank(a) - rank(b)));
  return out;
}

/** Where recipe `id` is planned in the window: none when it is not. */
export const plannedWhen = (index: PlannedIndex, id: string): readonly PlannedSpot[] => index.get(id) ?? [];

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Thu lunch", or "Thu" when no meal is named. */
export const spotText = (s: PlannedSpot): string => `${DAY[parseDate(s.day).getDay()]}${s.slot ? ` ${s.slot}` : ''}`;

/** The row's pill text: "Planned · Thu lunch" for one spot, "Planned · Thu lunch, dinner" for one day with two meals, "Planned · 3 days" for several days; null when nothing is planned. */
export function plannedPill(spots: readonly PlannedSpot[]): string | null {
  if (!spots.length) return null;
  const days = [...new Set(spots.map(s => s.day))];
  if (days.length > 1) return `Planned · ${days.length} days`;
  const meals = spots.flatMap(s => (s.slot ? [s.slot] : []));
  return `Planned · ${DAY[parseDate(days[0]!).getDay()]}${meals.length ? ` ${meals.join(', ')}` : ''}`;
}
