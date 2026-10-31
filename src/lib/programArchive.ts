import type { LibraryItem, Program } from '../types.ts';
import { sameProg } from './export.js';

// Program library > Archive: saved programs split into the ones in play and the ones put away (newest first), and the heading for the put-away list.
export function splitLibrary(library: LibraryItem[]): { active: LibraryItem[]; archived: LibraryItem[] } {
  const newest = (a: LibraryItem, b: LibraryItem) => (b.at || '').localeCompare(a.at || '');
  return { active: library.filter(it => !it.archived).sort(newest), archived: library.filter(it => it.archived).sort(newest) };
}

export const archivedHeading = (n: number) => `Archived (${n})`;

// Loading a program into A or B replaces the one there. Saved programs that hold exactly that replaced program, and are not what A or B hold now
// (`keep`: the program just loaded and the other slot's), have left the rotation, so they are archived on their own. Returns their ids.
export function leftRotationIds(library: LibraryItem[], leaving: Program, keep: Program[]): string[] {
  if (keep.some(k => sameProg(k, leaving))) return [];
  return library.filter(it => !it.archived && sameProg(it.prog, leaving) && !keep.some(k => sameProg(k, it.prog))).map(it => it.id);
}
