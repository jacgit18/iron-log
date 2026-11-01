import type { Logs } from '../types.ts';
import { nameCmp } from './sort.js';
import type { SortOption } from './sortChoice.js';

/** The Exercise library's sort choices. The first is the default. */
export const EXERCISE_SORTS = [
  { key: 'name', label: 'Name A to Z' },
  { key: 'used', label: 'Most used' },
  { key: 'last', label: 'Last used' },
] as const satisfies readonly SortOption[];
export type ExerciseSort = typeof EXERCISE_SORTS[number]['key'];
export const DEFAULT_EXERCISE_SORT: ExerciseSort = 'name';

/** Rows in the chosen order (a new array). Used and Last used put exercises never logged last; every tie falls back to name, then id. */
export function sortExerciseRows<R extends { id: string; name: string }>(rows: readonly R[], sort: ExerciseSort, logs: Logs): R[] {
  const byName = nameCmp<R>(x => x.name, x => x.id);
  const count = (r: R) => logs[r.id]?.length ?? 0;
  const last = (r: R) => (logs[r.id] ?? []).reduce((m, e) => (e.d > m ? e.d : m), '');
  if (sort === 'used') return [...rows].sort((a, b) => count(b) - count(a) || byName(a, b));
  if (sort === 'last') return [...rows].sort((a, b) => { const x = last(a), y = last(b); return x === y ? byName(a, b) : x < y ? 1 : -1; });
  return [...rows].sort(byName);
}
