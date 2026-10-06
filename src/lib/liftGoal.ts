import type { Cfg, LiftGoal, LogEntry, PhaseKey } from '../types.ts';
import { setsOfEntry } from './logic.js';
import { PHASES, PH_KEYS } from './data.js';
import { fmtLb } from './body.js';

/* ---------- Lift weight goals ----------
   cfg.liftGoals[exId][key] = { w, start, by? }: the weight you want to lift, your best when you set it, and an optional date.
   The key is a phase, or 'any' for a goal that counts every phase. A phase goal only counts sets logged in that phase.
   Progress counts sets you logged yourself, not the planned numbers a check-off fills in. */
export const GOAL_KEYS = ['any', ...PH_KEYS];
export const goalPhaseLabel = (k: string) => (k === 'any' ? 'Any phase' : PHASES[k as PhaseKey] ? PHASES[k as PhaseKey].label : k);
const DAY_MS = 864e5;
const parseISO = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// An exercise's goals as [key, goal] pairs, any-phase first, then in phase order.
export const liftGoalsOf = (cfg: Cfg, exId: string): [string, LiftGoal][] => {
  const G = (cfg.liftGoals || {})[exId] || {};
  return GOAL_KEYS.filter(k => G[k] && Number(G[k].w) > 0).map(k => [k, G[k]]);
};

// Heaviest set logged for a lift (in one phase, or any when key is 'any' or left out), with the date it was first lifted.
export function bestLift(entries: LogEntry[] | null | undefined, key = 'any') {
  let best = null as { w: number; d: string } | null;
  (entries || []).forEach(e => {
    if (!e || e.auto) return;
    if (key !== 'any' && (e.ph || null) !== key) return;
    setsOfEntry(e).forEach(x => { const w = Number(x.w); if (x.w != null && (x.w as unknown) !== '' && w > 0 && (!best || w > best.w)) best = { w, d: e.d }; });
  });
  return best;
}

export function liftGoalStatus(goal: LiftGoal | null | undefined, entries: LogEntry[] | null | undefined, today: Date, key = 'any') {
  if (!goal || !(Number(goal.w) > 0)) return null;
  const target = Number(goal.w); const best = bestLift(entries, key);
  const start = Number(goal.start) > 0 ? Number(goal.start) : 0;
  const now = best ? best.w : null;
  const reached = now != null && now >= target;
  const left = now != null ? target - now : target;
  const base = Math.min(start, now ?? start);
  const pct = reached ? 100 : target > base ? Math.max(0, Math.min(99, Math.round(((now ?? base) - base) / (target - base) * 100))) : 0;
  const out: { key: string; target: number; start: number; best: { w: number; d: string } | null; now: number | null; left: number; reached: boolean; pct: number; by: string | null; weeksLeft?: number; need?: number } = { key, target, start, best, now, left, reached, pct, by: goal.by || null };
  if (goal.by && !reached) { const weeks = (parseISO(goal.by) - parseISO(ymdOf(today))) / (7 * DAY_MS); out.weeksLeft = weeks; if (weeks > 0) out.need = left / weeks; }
  return out;
}

// Status of every goal on an exercise, optionally only those that a set in phase `ph` counts toward.
export function liftGoalsStatus(cfg: Cfg, exId: string, entries: LogEntry[] | null | undefined, today: Date, ph?: string | null) {
  return liftGoalsOf(cfg, exId).filter(([k]) => ph === undefined || k === 'any' || k === (ph || null))
    .map(([k, goal]) => liftGoalStatus(goal, entries, today, k));
}

// One line for cards and the log sheet: "Goal 225 lb (Strength) · 20 lb to go".
export const liftGoalNote = (g: { key: string; target: number; reached: boolean; left: number } | null | undefined) => (g
  ? `Goal ${fmtLb(g.target)} lb${g.key !== 'any' ? ` (${goalPhaseLabel(g.key)})` : ''} · ${g.reached ? 'reached' : `${fmtLb(g.left)} lb to go`}`
  : '');
