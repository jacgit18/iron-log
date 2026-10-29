import { PHASES, allExIds, slotsFor } from './data.js';
import type { Cfg, LogEntry, PhaseKey } from '../types.ts';

// A 1-rep max worked out from what was logged, so it need not be guessed. It is for reference only: a 1RM never sets a target weight.
// The estimate is the Epley formula, weight x (1 + reps / 30), over the best set of 10 reps or fewer (it drifts above that). Timed holds have no reps and no estimate.
export const MAX_REPS_FOR_ESTIMATE = 10;

export type Lift = { w: number; r: number; ph: PhaseKey | null };
export type Max = { value: number; source: 'tested' | 'estimated'; from: Lift | null; estimate: number | null };

const epley = (w: number, r: number) => w * (1 + r / 30);

/** Every set of an exercise that has a weight and reps: the per-set record when the entry has one, else its summary (heaviest weight, lowest reps). */
export function liftsOf(entries: readonly LogEntry[] | null | undefined): Lift[] {
  const out: Lift[] = [];
  for (const e of entries || []) {
    const ph = e.ph ?? null;
    const sets = e.sets?.length ? e.sets : [{ w: e.w, r: e.r }];
    for (const x of sets) { const w = Number(x.w), r = Number(x.r); if (w > 0 && r >= 1) out.push({ w, r, ph }); }
  }
  return out;
}

/** The best lift for an estimate (the highest Epley value among sets of 10 reps or fewer; the heavier one when equal) and the rounded estimate, or null. */
export function estimateMax(entries: readonly LogEntry[] | null | undefined): { value: number; from: Lift } | null {
  let best: Lift | null = null;
  for (const l of liftsOf(entries)) {
    if (l.r > MAX_REPS_FOR_ESTIMATE) continue;
    if (!best || epley(l.w, l.r) > epley(best.w, best.r) || (epley(l.w, l.r) === epley(best.w, best.r) && l.w > best.w)) best = l;
  }
  return best ? { value: Math.round(epley(best.w, best.r)), from: best } : null;
}

/** The number to show: the typed 1RM when there is one ("tested"), else the estimate, else null. `estimate` is kept beside a typed value so the screen can say what the logs suggest. */
export function currentMax(typed: number | null | undefined, entries: readonly LogEntry[] | null | undefined): Max | null {
  const est = estimateMax(entries);
  if (typed != null && typed > 0) return { value: typed, source: 'tested', from: null, estimate: est?.value ?? null };
  return est ? { value: est.value, source: 'estimated', from: est.from, estimate: est.value } : null;
}

export type PhaseRow = { ph: PhaseKey | null; w: number; r: number; pct: number | null; target: number | null; diff: number | null };

/** For each phase the exercise was lifted in, its best set (by Epley value, any rep count) with the percent of `max` it is, the phase's target percent and the difference. */
export function phaseRows(entries: readonly LogEntry[] | null | undefined, max: number | null, cfg: Pick<Cfg, 'pct'>): PhaseRow[] {
  const best = new Map<string, Lift>();
  for (const l of liftsOf(entries)) { const k = String(l.ph); const b = best.get(k); if (!b || epley(l.w, l.r) > epley(b.w, b.r)) best.set(k, l); }
  const order = Object.keys(PHASES);
  return [...best.values()].sort((a, b) => (a.ph ? order.indexOf(a.ph) : 99) - (b.ph ? order.indexOf(b.ph) : 99)).map(l => {
    const pct = max ? Math.round((l.w / max) * 100) : null;
    const target = l.ph ? (cfg.pct?.[l.ph] ?? PHASES[l.ph].pct) || null : null; // Mobility has no share
    return { ph: l.ph, w: l.w, r: l.r, pct, target, diff: pct != null && target != null ? pct - target : null };
  });
}

/** The exercises that have a program weight, in the library's order: the ones a 1RM is worth showing for. Program ids too: synced, a card can use an exercise that is not in the library (ADR 024). */
export function weightedExIds(cfg: Cfg, programs: Record<string, Parameters<typeof slotsFor>[0]>): string[] {
  const all = [...slotsFor(programs.A!), ...slotsFor(programs.B!)];
  return [...new Set([...allExIds(cfg), ...all.flatMap(s => s.items.map(i => i.ex))])].filter(id => all.some(s => s.items.some(i => i.ex === id && i.w != null)));
}

/** The second line of an exercise's row: "Estimated 286 lb", "Tested 315 lb", or what to do to get one. */
export function maxLine(m: Max | null): string {
  if (!m) return 'Log a set of 10 reps or fewer to get an estimate';
  return `${m.source === 'tested' ? 'Tested' : 'Estimated'} ${m.value} lb`;
}

/** How a phase's best lift compares with its target: "Target 85%. 1 point over." */
export function targetNote(row: PhaseRow): string {
  if (row.target == null) return 'No target for this phase.';
  if (row.diff == null) return `Target ${row.target}%.`;
  if (row.diff === 0) return `Target ${row.target}%. On target.`;
  const n = Math.abs(row.diff);
  return `Target ${row.target}%. ${n} ${n === 1 ? 'point' : 'points'} ${row.diff < 0 ? 'under' : 'over'}.`;
}
