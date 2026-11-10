import { DAYS, colOf, restsOf } from './logic.js';
import type { Week } from '../types.ts';

export interface IdeaDay { col: number; on: boolean; today: boolean }

/** The board columns an idea can be added to, in the order the board shows them now (after swaps): rest columns are left out,
 *  `on` marks the columns the exercise is already on this week, `today` the column of today (null: not the viewed week). */
export function ideaDayChoices(week: Week, ex: string, todayColumn: number | null): IdeaDay[] {
  const rest = restsOf(week);
  const on = new Set((week.extra || []).filter(x => x.ex === ex).map(x => colOf(week, week.moved?.[x.id] || x.day)));
  return DAYS.filter(c => !rest.includes(c)).map(col => ({ col, on: on.has(col), today: col === todayColumn }));
}

/** The days (columns) of this week an exercise is on, where a dragged card now sits, ascending. */
export const daysOn = (week: Week, ex: string) => [...new Set((week.extra || []).filter(x => x.ex === ex).map(x => colOf(week, week.moved?.[x.id] || x.day)))].sort((a, b) => a - b);
