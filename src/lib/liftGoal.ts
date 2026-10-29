import type { BodyEntry, Cfg, LiftGoal, LogEntry, PhaseKey } from '../types.ts';
import { setsOfEntry } from './logic.js';
import { PHASES, PH_KEYS } from './data.js';
import type { MuscleKey, MuscleTags } from '../types.ts';
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

/* A goal that scales with body weight (`bw` and `bwd` set) is worth its base weight `w` times your highest body weight logged since `bwd`
   over `bw`, in steps of 5 lb, and never less than `w`: it rises as you gain and stays put when you lose. Other goals are returned as they are. */
export const GOAL_STEP = 5;
export function scaledGoal(goal: LiftGoal, body?: BodyEntry[] | null): LiftGoal {
  const bw = Number(goal.bw); if (!(bw > 0) || !goal.bwd) return goal;
  const peak = Math.max(bw, ...(body || []).filter(e => e && e.d >= goal.bwd! && Number(e.w) > 0).map(e => Number(e.w)));
  const w = Math.max(goal.w, Math.round(goal.w * peak / bw / GOAL_STEP) * GOAL_STEP);
  return w === goal.w ? goal : { ...goal, w };
}

/* The multiplier: a scaled goal as a multiple of body weight (a 300 lb hip thrust at 120 lb is 2.5). Suggested from the muscles the exercise trains:
   1.5 when most of its primary muscles are in the upper body, else 2.5. Only a starting point; the form lets you change it. */
const UPPER: MuscleKey[] = ['neck', 'traps', 'frontdelt', 'sidedelt', 'reardelt', 'rotatorcuff', 'chest', 'serratus', 'biceps', 'triceps', 'forearms', 'lats', 'upperback'];
export const UPPER_MULT = 1.5; export const LOWER_MULT = 2.5;
export function suggestedMultiplier(tags: MuscleTags | null | undefined): number {
  const p = tags && !tags.mob ? tags.p || [] : [];
  return p.length && p.filter(m => UPPER.includes(m)).length * 2 > p.length ? UPPER_MULT : LOWER_MULT;
}
export const goalFromMultiplier = (mult: number, bodyLb: number) => Math.round(mult * bodyLb / GOAL_STEP) * GOAL_STEP;
export const multiplierOf = (goalLb: number, bodyLb: number) => Math.round(goalLb / bodyLb * 100) / 100;

// An exercise's goals as [key, goal] pairs, any-phase first, then in phase order. Pass `body` to get scaled goals at their current weight.
export const liftGoalsOf = (cfg: Cfg, exId: string, body?: BodyEntry[] | null): [string, LiftGoal][] => {
  const G = (cfg.liftGoals || {})[exId] || {};
  return GOAL_KEYS.filter(k => G[k] && Number(G[k].w) > 0).map(k => [k, scaledGoal(G[k], body)]);
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
export function liftGoalsStatus(cfg: Cfg, exId: string, entries: LogEntry[] | null | undefined, today: Date, ph?: string | null, body?: BodyEntry[] | null) {
  return liftGoalsOf(cfg, exId, body).filter(([k]) => ph === undefined || k === 'any' || k === (ph || null))
    .map(([k, goal]) => liftGoalStatus(goal, entries, today, k)!); // liftGoalsOf only lists goals with a weight, so none is null
}

// One line for cards and the log sheet: "Goal 225 lb (Strength) · 20 lb to go".
export const liftGoalNote = (g: { key: string; target: number; reached: boolean; left: number } | null | undefined) => (g
  ? `Goal ${fmtLb(g.target)} lb${g.key !== 'any' ? ` (${goalPhaseLabel(g.key)})` : ''} · ${g.reached ? 'reached' : `${fmtLb(g.left)} lb to go`}`
  : '');
