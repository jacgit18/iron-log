import type { Cfg, Program, Week } from '../types.ts';
import { DAY_COUNT } from './data.js';
import { avgPerTrainingDay } from './freqGoal.js';
import { WEEK_GOAL_DAYS, WEEK_RE, weekSummary } from './trends.js';
import { addDays, parseDate, weekStartOf, ymd } from '../shared/dates.js';

export type HistoryRow = ReturnType<typeof weekSummary> & { isNow: boolean; label: string };
export type HistorySummary = { met: number; pastCount: number; mean: string; perDay: number | null };

// Screen-reader text for a week's day cells.
export function weekRowLabel(full: number, days: number[]): string {
  return `${full} of ${DAY_COUNT} days complete: ${days.map((x, i) => `day ${i + 1} ${x === 2 ? 'complete' : x === 1 ? 'partly done' : 'not started'}`).join(', ')}`;
}

// What the Weekly history panel shows: one row per week from the earliest week with any exercise done up to this week (at most `maxWeeks`),
// and the goal/average summary over the past weeks. A week with no saved record counts as an empty one.
export function historyRows(cfg: Cfg, programs: Record<string, Program>, weekHist: Record<string, Week> | null, week: Week, shownKey: string, today: Date, maxWeeks: number): { rows: HistoryRow[]; summary: HistorySummary | null } {
  const weeks: Record<string, Week> = { ...(weekHist || {}), [shownKey]: week }; // live view of the shown week
  const thisSun = ymd(weekStartOf(today));
  const active = Object.keys(weeks).filter(k => WEEK_RE.test(k) && k <= thisSun && weekSummary(cfg, programs, k, weeks[k]).ex > 0).sort();
  const keys: string[] = [];
  if (active.length) { let d = parseDate(thisSun); const first = parseDate(active[0]); while (d >= first && keys.length < maxWeeks) { keys.push(ymd(d)); d = addDays(d, -7); } }
  else keys.push(thisSun);
  const rows: HistoryRow[] = keys.map(k => {
    const s = weekSummary(cfg, programs, k, weeks[k] || { done: {}, moved: {} });
    return { ...s, isNow: k === thisSun, label: weekRowLabel(s.full, s.days) };
  });
  const past = rows.filter(r => !r.isNow);
  const summary = past.length ? {
    met: past.filter(r => r.full >= WEEK_GOAL_DAYS).length,
    pastCount: past.length,
    mean: (past.reduce((a, r) => a + r.full, 0) / past.length).toFixed(1),
    perDay: avgPerTrainingDay(past),
  } : null;
  return { rows, summary };
}
