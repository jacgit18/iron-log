// Small pure rules for the Program editor: copying a day's cards, and saying where a library program is on the Board.
import type { Program, ProgramSlot } from '../types.ts';
import { sameProg } from './export.js';

/** Copies of `slots` with new ids (`idFor(i)` for card i), for another day of the same program. Nothing else changes: phase, targets, notes and
 *  the week a card starts in are kept, and a superset stays one card. */
export function copyDaySlots(slots: ProgramSlot[], idFor: (i: number) => string): ProgramSlot[] {
  return slots.map((sl, i) => ({ ...structuredClone(sl), id: idFor(i) }));
}

/** The programs on the Board (A, B) that hold exactly `prog`, in order. */
export function onBoardKeys(prog: Program, programs: Record<'A' | 'B', Program>): ('A' | 'B')[] {
  return (['A', 'B'] as const).filter(k => sameProg(prog, programs[k]));
}

/** "On your Board: Program A and Program B" or "Not on your Board", for a library row. */
export function boardNote(names: string[]): string {
  return names.length ? `On your Board: ${names.join(' and ')}` : 'Not on your Board';
}
