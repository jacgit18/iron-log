import type { Cfg, LogEntry, Logs } from '../types.ts';
import { entryWeek } from './trends.js';

/* ---------- Exercise frequency goals ----------
   cfg.freqGoals[exId] = how many sessions a week you want (1 to 7). A session is a day with a logged entry for the
   exercise, so a check-off (which logs the plan) counts like a set you logged yourself, and two entries on one day count once. */

/** Days in the week starting `weekKey` (its Sunday) on which `entries` has a session. */
export const sessionsInWeek = (entries: LogEntry[] | null | undefined, weekKey: string) =>
  new Set((entries || []).filter(e => e && entryWeek(e) === weekKey).map(e => e.d)).size;

/** Every goal as { id, goal, done, met }, this week's sessions against the target, goals not yet met first. */
export function freqGoalStatus(cfg: Cfg, logs: Logs, weekKey: string) {
  return Object.entries(cfg.freqGoals || {})
    .map(([id, goal]) => { const done = sessionsInWeek(logs[id], weekKey); return { id, goal, done, met: done >= goal }; })
    .sort((a, b) => Number(a.met) - Number(b.met) || a.id.localeCompare(b.id));
}

/** Average exercises done on a day you trained, over the given weeks (null when no day had any). */
export function avgPerTrainingDay(weeks: { days: number[]; ex: number }[]): number | null {
  const days = weeks.reduce((n, w) => n + w.days.filter(x => x > 0).length, 0);
  return days ? weeks.reduce((n, w) => n + w.ex, 0) / days : null;
}
