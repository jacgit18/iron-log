import { MAX_REPEATS, samePlanItem } from '../shared/diet.js';
import { parseDate } from '../shared/dates.js';
import type { PlanItem, RepeatItem } from '../types.ts';
import { inWindow, type Plan } from './dietPlan.js';

/* ---------- Repeats (brief nutrition-meal-labels-year-repeat): an item stored once and shown on chosen weekdays of every week in the plan window. Pure; the store writes the list and the board draws what shows. ---------- */

/** The item a repeat shows as on a day: marked `v` (never stored) and `rp` (which repeat), so a tap can skip it for that day. */
export const repeatPlanItem = (r: RepeatItem): PlanItem => ({ k: r.k, id: r.id, ...(r.x ? { x: r.x } : {}), ...(r.s ? { s: r.s } : {}), v: true, rp: r.rid });

/** The repeats that show on `day`: the day is in the plan window (today to the last plannable day, so never a past day or one beyond the window), on or after the repeat's start day, on one of its weekdays, not skipped that day, and not already there as a stored item (the same food in the same meal; the stored one wins). */
export function repeatsShownOn(day: string, plan: Plan, repeats: readonly RepeatItem[] | undefined, skips: Readonly<Record<string, string[]>> | undefined, today: string): RepeatItem[] {
  if (!repeats?.length || !inWindow(day, today)) return [];
  const weekday = parseDate(day).getDay(), real = plan[day] ?? [], skipped = skips?.[day] ?? [];
  return repeats.filter(r => day >= r.from && r.days.includes(weekday) && !skipped.includes(r.rid) && !real.some(i => samePlanItem(i, { k: r.k, id: r.id, ...(r.s ? { s: r.s } : {}) })));
}

/** `plan` with each day's shown repeats added after its stored items. The same object when nothing is added, so memos hold. */
export function withRepeats(plan: Plan, repeats: readonly RepeatItem[] | undefined, skips: Readonly<Record<string, string[]>> | undefined, days: readonly string[], today: string): Plan {
  if (!repeats?.length) return plan;
  let out: Plan | null = null;
  for (const day of days) {
    const shown = repeatsShownOn(day, plan, repeats, skips, today);
    if (shown.length) (out ??= { ...plan })[day] = [...(plan[day] ?? []), ...shown.map(repeatPlanItem)];
  }
  return out ?? plan;
}

type Edit = { list: RepeatItem[]; error: null } | { list: null; error: string };

/** `list` with `item` added. An error text when the list is full or that repeat (same `rid`, or the same food in the same meal on the same days) is already there. */
export function addRepeat(list: readonly RepeatItem[], item: RepeatItem): Edit {
  if (list.length >= MAX_REPEATS) return { list: null, error: `You can keep ${MAX_REPEATS} repeats.` };
  if (list.some(r => r.rid === item.rid || (samePlanItem({ k: r.k, id: r.id, s: r.s }, { k: item.k, id: item.id, s: item.s }) && r.days.join() === item.days.join()))) return { list: null, error: 'That already repeats.' };
  return { list: [...list, item], error: null };
}

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
