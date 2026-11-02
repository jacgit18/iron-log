import type { LibraryItem } from '../types.ts';
import { nameCmp } from './sort.js';
import type { SortOption } from './sortChoice.js';

/** The Program library's sort choices. The first is the default (newest saved first, as the list has always been). */
export const PROGRAM_SORTS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'name', label: 'Name A to Z' },
] as const satisfies readonly SortOption[];
export type ProgramSort = typeof PROGRAM_SORTS[number]['key'];
export const DEFAULT_PROGRAM_SORT: ProgramSort = 'newest';

/** Saved programs in the chosen order (a new array). Programs saved the same moment, or with the same name, fall back to name, then id. */
export function sortLibraryItems(items: readonly LibraryItem[], sort: ProgramSort): LibraryItem[] {
  const byName = nameCmp<LibraryItem>(it => it.name, it => it.id);
  if (sort === 'name') return [...items].sort(byName);
  // The dates are ISO strings, so they compare as text.
  return [...items].sort((a, b) => ((b.at || '') < (a.at || '') ? -1 : (b.at || '') > (a.at || '') ? 1 : byName(a, b)));
}
