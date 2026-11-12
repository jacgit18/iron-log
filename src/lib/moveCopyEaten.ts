import { MAX_DIET_PER_DAY, normDietEntry } from '../shared/diet.js';
import type { DietEntry } from '../types.ts';
import { ateDayError, oldestDay, roomOn } from './dietLog.js';

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
