import { nameCmp } from './sort.js';
import type { SortOption } from './sortChoice.js';

/** The Progress lifts list's sort choices. The first is the default (the lift you trained last on top). */
export const LIFT_SORTS = [
  { key: 'recent', label: 'Most recent' },
  { key: 'name', label: 'Name A to Z' },
  { key: 'stalled', label: 'Stalled first' },
] as const satisfies readonly SortOption[];
export type LiftSort = typeof LIFT_SORTS[number]['key'];
export const DEFAULT_LIFT_SORT: LiftSort = 'recent';

/** Lift ids in the chosen order (a new array). `recentIds` is already newest first (`newestFirst`); Stalled first keeps that order inside each group. */
export function sortLiftIds(recentIds: readonly string[], sort: LiftSort, nameOf: (id: string) => string, needsAttention: (id: string) => boolean): string[] {
  if (sort === 'name') return [...recentIds].sort(nameCmp<string>(nameOf, id => id));
  if (sort === 'stalled') {
    const rank = new Map(recentIds.map((id, i) => [id, i]));
    const flag = new Map(recentIds.map(id => [id, needsAttention(id)]));
    return [...recentIds].sort((a, b) => Number(flag.get(b)) - Number(flag.get(a)) || (rank.get(a) as number) - (rank.get(b) as number));
  }
  return [...recentIds];
}
