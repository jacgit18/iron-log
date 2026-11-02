// What the Create a program sheet offers to start from, as plain values the sheet and its tests share.
// A start is 'starter:<id>' (a ready-made plan, lib/starterPrograms.ts), 'copy:A' or 'copy:B' (a copy of that program), or 'blank'.
import { STARTERS, starterById } from './starterPrograms.js';

export type StartKind = { kind: 'starter'; id: string } | { kind: 'copy'; key: 'A' | 'B' } | { kind: 'blank' };

export const START_VALUES: string[] = [...STARTERS.map(s => `starter:${s.id}`), 'copy:A', 'copy:B', 'blank'];

export function parseStart(v: string): StartKind | null {
  if (v === 'blank') return { kind: 'blank' };
  if (v === 'copy:A' || v === 'copy:B') return { kind: 'copy', key: v[5] as 'A' | 'B' };
  if (v.startsWith('starter:') && starterById(v.slice(8))) return { kind: 'starter', id: v.slice(8) };
  return null;
}

/** The days-a-week choices a start offers (a starter only), the default first. Empty for a copy or a blank program. */
export function daysChoices(v: string): number[] {
  const s = parseStart(v);
  return s?.kind === 'starter' ? [...starterById(s.id)!.perWeek] : [];
}

/** The name the sheet fills in until the person types their own. */
export function suggestName(v: string, days: number, progLabel: (key: 'A' | 'B') => string): string {
  const s = parseStart(v);
  if (!s) return '';
  if (s.kind === 'starter') return `${starterById(s.id)!.name} · ${days} days`;
  if (s.kind === 'copy') return `Copy of ${progLabel(s.key)}`.slice(0, NAME_MAX);
  return 'My program';
}

/** The longest program name (the sheet's box limit, and what renaming a saved program keeps). */
export const NAME_MAX = 60;

/** What loading a library program into a slot does with the program there now, the same rule as `loadVersion`: it is saved to the library first
 *  only when it differs from the original and is not already saved there. */
export type LoadEffect = 'saved first' | 'unchanged' | 'already saved';
export function loadEffect(isOriginal: boolean, inLibrary: boolean): LoadEffect {
  if (isOriginal) return 'unchanged';
  return inLibrary ? 'already saved' : 'saved first';
}
