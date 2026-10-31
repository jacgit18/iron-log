import type { LibraryItem } from '../types.ts';

// Program library > Archive: saved programs split into the ones in play and the ones put away (newest first), and the heading for the put-away list.
export function splitLibrary(library: LibraryItem[]): { active: LibraryItem[]; archived: LibraryItem[] } {
  const newest = (a: LibraryItem, b: LibraryItem) => (b.at || '').localeCompare(a.at || '');
  return { active: library.filter(it => !it.archived).sort(newest), archived: library.filter(it => it.archived).sort(newest) };
}

export const archivedHeading = (n: number) => `Archived (${n})`;
