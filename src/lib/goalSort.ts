import { nameCmp } from './sort.js';
import type { SortOption } from './sortChoice.js';

/** Weight goals: A to Z by default, or the goals nearest to done first. */
export const WEIGHT_GOAL_SORTS = [
  { key: 'name', label: 'Name A to Z' },
  { key: 'closest', label: 'Closest to goal' },
] as const satisfies readonly SortOption[];
export type WeightGoalSort = typeof WEIGHT_GOAL_SORTS[number]['key'];
export const DEFAULT_WEIGHT_GOAL_SORT: WeightGoalSort = 'name';

/** An exercise's progress toward its nearest open goal (0 to 99, 0 when nothing is logged yet), `reached` when every goal is met, or null when it has no goal. */
export type GoalProgress = { pct: number; reached: boolean } | null;

/** Weight goal rows in the chosen order (a new array). Closest to goal puts the highest percentage first (a deadline is not weighed), then reached goals, then rows with no goal; ties by name, then id. */
export function sortWeightGoalRows<R extends { id: string; name: string }>(rows: readonly R[], sort: WeightGoalSort, progressOf: (id: string) => GoalProgress): R[] {
  const byName = nameCmp<R>(r => r.name, r => r.id);
  if (sort !== 'closest') return [...rows].sort(byName);
  const group = (r: R) => { const p = progressOf(r.id); return p == null ? 2 : p.reached ? 1 : 0; };
  return [...rows].sort((a, b) => group(a) - group(b) || (progressOf(b.id)?.pct ?? 0) - (progressOf(a.id)?.pct ?? 0) || byName(a, b));
}

/** Frequency goals: the order they have always had (goals not yet met first), A to Z, or the ones nearest to met first. */
export const FREQ_GOAL_SORTS = [
  { key: 'open', label: 'Not met first' },
  { key: 'name', label: 'Name A to Z' },
  { key: 'closest', label: 'Closest to goal' },
] as const satisfies readonly SortOption[];
export type FreqGoalSort = typeof FREQ_GOAL_SORTS[number]['key'];
export const DEFAULT_FREQ_GOAL_SORT: FreqGoalSort = 'open';

/** Frequency rows in the chosen order (a new array). Not met first keeps the order given (freqGoalStatus: unmet first, then by id, which is not name order, kept as it has always been); Closest to goal puts unmet goals with the most sessions done against the target first, met goals last. */
export function sortFreqRows<R extends { id: string; goal: number; done: number; met: boolean }>(rows: readonly R[], sort: FreqGoalSort, nameOf: (id: string) => string): R[] {
  const byName = nameCmp<R>(r => nameOf(r.id), r => r.id);
  if (sort === 'name') return [...rows].sort(byName);
  if (sort === 'closest') return [...rows].sort((a, b) => Number(a.met) - Number(b.met) || b.done / b.goal - a.done / a.goal || byName(a, b));
  return [...rows];
}
