import { MAX_REPEATS, samePlanItem } from '../shared/diet.js';
import { parseDate } from '../shared/dates.js';
import type { PlanItem, PlanSlot, RepeatItem } from '../types.ts';
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

/** `list` with a repeat saved: a repeat that already has `rid` takes the new days; otherwise the item is added as a new repeat from `from` (the day it was set on). An error text for no days, a full list or a repeat that is already there. */
export function saveRepeat(list: readonly RepeatItem[], spec: { rid?: string; item: { k: 'r' | 'm'; id: string; x?: number; s?: PlanSlot }; days: readonly number[]; from: string }): Edit {
  const days = [...new Set(spec.days)].sort((a, b) => a - b);
  if (!days.length) return { list: null, error: 'Pick at least one day.' };
  if (spec.rid && list.some(r => r.rid === spec.rid)) return { list: list.map(r => (r.rid === spec.rid ? { ...r, days } : r)), error: null };
  const { k, id, x, s } = spec.item;
  return addRepeat(list, { rid: newRid(list), k, id, ...(x && x !== 1 ? { x } : {}), ...(s ? { s } : {}), days, from: spec.from });
}

/** The skips with the repeat that a stored item on `day` stands for skipped there, so taking the item off its place (removing it, moving it to another meal or day) does not bring the repeat back in its spot. The skips unchanged (undefined) when the item stands for no repeat that shows on that day. */
export function skipsAfterLeaving(repeats: readonly RepeatItem[] | undefined, skips: Readonly<Record<string, string[]>> | undefined, day: string, item: { k: string; id: string; s?: PlanSlot } | undefined): Record<string, string[]> | undefined {
  if (!item || !repeats?.length) return undefined;
  const weekday = parseDate(day).getDay();
  const r = repeats.find(x => samePlanItem(item as PlanItem, { k: x.k, id: x.id, ...(x.s ? { s: x.s } : {}) }) && day >= x.from && x.days.includes(weekday) && !(skips?.[day] ?? []).includes(x.rid));
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
export function repeatFor(list: readonly RepeatItem[] | undefined, item: { k: string; id: string; s?: PlanSlot; rp?: string }): RepeatItem | undefined {
  if (item.rp) return list?.find(r => r.rid === item.rp);
  return list?.find(r => samePlanItem(item as PlanItem, { k: r.k, id: r.id, ...(r.s ? { s: r.s } : {}) }));
}

/** The sentence under the day ticks: what the choice means. */
export function repeatSummary(days: readonly number[], meal: string, fromName: string): string {
  if (!days.length) return 'Pick at least one day.';
  return `${daysName(days)} in ${meal}, every week from ${fromName} for the next 52 weeks. Nothing is copied: change or stop it here.`;
}
