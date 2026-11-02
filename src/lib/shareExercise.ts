// Creating an exercise from the share sheet (brief share-create-exercise): the name it starts with and the check before it is saved.
import type { Cfg } from '../types.ts';
import { findExIdIn } from './exerciseLibrary.js';

export const MAX_EXERCISE_NAME = 80; // the same limit as the Exercise sheet's name field

/** The name a new exercise starts with: the shared title on one line, cut to the name limit. */
export const startName = (title: string) => title.replace(/\s+/g, ' ').trim().slice(0, MAX_EXERCISE_NAME);

/** A name as it is stored: one line, single spaces. */
export const cleanName = (name: string) => name.replace(/\s+/g, ' ').trim();

/** The reason a new exercise cannot be saved with this name, or null. `inUse`: ids your programs still use (found by name too). */
export function newExerciseError(cfg: Cfg, name: string, inUse: string[]): string | null {
  const n = cleanName(name);
  if (!n) return 'Give the exercise a name.';
  if (n.length > MAX_EXERCISE_NAME) return `Use ${MAX_EXERCISE_NAME} characters or fewer.`;
  if (findExIdIn(cfg, n, inUse)) return 'That exercise is already in the library.';
  return null;
}
