import type { Cfg, LogEntry, Logs } from '../types.ts';
import { entryWeek } from './trends.js';

/* ---------- Exercise frequency goals ----------
   cfg.freqGoals[exId] = how many sessions a week you want (1 to 7). A session is a day with a logged entry for the
   exercise, so a check-off (which logs the plan) counts like a set you logged yourself. A check-off is dated the day you tapped
   it, not the day its card is on, so an entry whose card is on the board (`columnOf` knows its slot) counts for that board day
   and the rest for their date; two entries on one day count once. */

/** Days in the week starting `weekKey` (its Sunday) on which `entries` has a session. */
export const sessionsInWeek = (entries: LogEntry[] | null | undefined, weekKey: string, columnOf?: (slot: string) => number | null) =>
  new Set((entries || []).filter(e => e && entryWeek(e) === weekKey)
    .map(e => { const c = e.slot && columnOf ? columnOf(e.slot) : null; return c != null ? `c${c}` : `d${e.d}`; })).size;

/** Every goal as { id, goal, done, met }, this week's sessions against the target, goals not yet met first. */
export function freqGoalStatus(cfg: Cfg, logs: Logs, weekKey: string, columnOf?: (slot: string) => number | null) {
  return Object.entries(cfg.freqGoals || {})
    .map(([id, goal]) => { const done = sessionsInWeek(logs[id], weekKey, columnOf); return { id, goal, done, met: done >= goal }; })
    .sort((a, b) => Number(a.met) - Number(b.met) || a.id.localeCompare(b.id)); // sort-ok: ids, after the met flag
}

/** Average exercises done on a day you trained, over the given weeks (null when no day had any). `dayDone` is each board day's count (weekSummary). */
export function avgPerTrainingDay(weeks: { dayDone: number[] }[]): number | null {
  const done = weeks.flatMap(w => w.dayDone).filter(n => n > 0);
  return done.length ? done.reduce((a, b) => a + b, 0) / done.length : null;
}
