import { MAX_DIET_PER_DAY, normDietEntry } from '../shared/diet.js';
import type { DietEntry, PlanItem } from '../types.ts';
import { ONE_OFF_REASON, PAST_ONLY_REASON, WINDOW_REASON, dayReason, resultText, type SkippedDay } from './dayPicker.js';
import { ateDayError, oldestDay, roomOn } from './dietLog.js';
import { mealByTime } from './nutritionBoard.js';

// Move to day and Copy to day for an eaten food (brief nutrition-move-copy-eaten). One rule, here, so the sheet and the store can't drift.
// A copy is the same food on another day: numbers, micronutrients, recipe link and the hour `t` carry over (the hour rule stays: Move and Copy change the day, never the meal).
// A move is a copy plus the removal of the original, as one list-to-list step, so no entry is lost or duplicated.

export type CopyResult = { list: DietEntry[]; id: string | null; error: string | null };

/** Why this entry can't go to `toDay`, or null. Only food you ate (today or earlier) is a source; a target follows the day-to-log rule (today or earlier, still kept, a real date) and is never the entry's own day. */
export function copyError(entry: Pick<DietEntry, 'd'>, toDay: string, today: string): string | null {
  if (entry.d > today) return 'Only food you ate can move or copy.';
  if (toDay === entry.d) return 'Pick another day.';
  return ateDayError(toDay, today);
}

/** The days an eaten entry can go to, from a board's day list: past days and today (not before the oldest kept day), never its own day; none for a source on a future day. Keeps the list's order. */
export function eatenTargets<T extends { id: string }>(entry: Pick<DietEntry, 'd'>, today: string, days: readonly T[]): T[] {
  if (entry.d > today) return [];
  const oldest = oldestDay(today);
  return days.filter(d => d.id <= today && d.id >= oldest && d.id !== entry.d);
}

/** Copy (or move) entry `id` to `toDay`. The copy gets `newId` and goes at the end of the list; a move also drops the original. On any refusal the list comes back unchanged with the sentence to show. */
export function copyEaten(list: readonly DietEntry[], id: string, toDay: string, today: string, newId: string, move: boolean): CopyResult {
  const keep = (error: string): CopyResult => ({ list: [...list], id: null, error });
  const src = list.find(e => e.id === id);
  if (!src) return keep('That entry is gone.');
  const bad = copyError(src, toDay, today);
  if (bad) return keep(bad);
  if (!roomOn(list as DietEntry[], toDay)) return keep(`You can log ${MAX_DIET_PER_DAY} things a day.`);
  if (list.some(e => e.id === newId)) return keep('Couldn’t log that.');
  const copy = normDietEntry({ ...src, id: newId, d: toDay });
  if (!copy) return keep('Couldn’t log that.');
  return { list: [...(move ? list.filter(e => e.id !== id) : list), copy], id: copy.id, error: null };
}

export interface EatenCopy { day: string; id: string }
/** A plan card an eaten copy to a day ahead becomes: the recipe the entry came from, in the meal its hour belongs to. */
export interface PlanAdd { day: string; item: PlanItem }
export interface ManyResult { list: DietEntry[]; copied: EatenCopy[]; planAdds: PlanAdd[]; skipped: SkippedDay[]; error: string | null }

/** Copy (or move) entry `id` to several days in one list-to-list step. Days up to today get a copy (the single-day rules: 20 a day, a kept day, never its own day); a day ahead gets a plan card in `planAdds` when the entry has a recipe link, else it is skipped. A full or invalid day is skipped and named, the rest still copy; a batch with nothing to do comes back unchanged with the sentence to show. A move takes exactly one day. `newId` makes an id not in the list given. */
export function copyEatenMany(list: readonly DietEntry[], id: string, days: readonly string[], today: string, newId: (taken: DietEntry[]) => string, move: boolean): ManyResult {
  const refuse = (error: string): ManyResult => ({ list: [...list], copied: [], planAdds: [], skipped: [], error });
  const src = list.find(e => e.id === id);
  if (!src) return refuse('That entry is gone.');
  if (src.d > today) return refuse(PAST_ONLY_REASON);
  const uniq = [...new Set(days)];
  if (!uniq.length) return refuse('Pick a day.');
  if (move && uniq.length !== 1) return refuse('Move takes one day.');
  let next = [...list];
  const copied: EatenCopy[] = [], planAdds: PlanAdd[] = [], skipped: SkippedDay[] = [];
  for (const day of uniq) {
    if (day > today) {
      const bad = dayReason({ kind: 'eaten', entry: src }, day, today);
      if (bad) { skipped.push({ day, reason: bad === ONE_OFF_REASON ? 'one-off food' : bad === WINDOW_REASON ? 'out of reach' : 'not allowed' }); continue; }
      const item: PlanItem = { k: 'r', id: src.from!, ...(src.t !== undefined ? { s: mealByTime(src.t * 60) } : {}) };
      planAdds.push({ day, item });
      continue;
    }
    const bad = copyError(src, day, today);
    if (bad) { skipped.push({ day, reason: bad === 'Pick another day.' ? 'its own day' : 'not allowed' }); continue; }
    if (!roomOn(next, day)) { skipped.push({ day, reason: 'full' }); continue; }
    const copy = normDietEntry({ ...src, id: newId(next), d: day });
    if (!copy || next.some(e => e.id === copy.id)) { skipped.push({ day, reason: 'couldn’t log' }); continue; }
    next = [...next, copy];
    copied.push({ day, id: copy.id });
  }
  if (!copied.length && !planAdds.length) return { list: [...list], copied: [], planAdds: [], skipped, error: resultText('Copied', [], skipped) };
  if (move) next = next.filter(e => e.id !== id);
  return { list: next, copied, planAdds, skipped, error: null };
}
