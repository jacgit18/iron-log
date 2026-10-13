import type { FocusEvent, KeyboardEvent } from 'react';

// Weight and reps boxes of a set table (LogSheet, DetailSheet). Logging a session is a run of numbers, so the boxes
// select their contents on focus (typing replaces a filled-in value) and Enter moves to the next box instead of saving
// the whole sheet. Enter in the last box still saves.
export const selectOnFocus = (e: FocusEvent<HTMLInputElement>): void => { e.currentTarget.select(); };

/** Enter in a set box focuses the next one. Returns true when it did, so the form does not submit. */
export function advanceOnEnter(e: KeyboardEvent<HTMLInputElement>): boolean {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.shiftKey) return false;
  const cells = [...(e.currentTarget.closest('.setbox')?.querySelectorAll<HTMLInputElement>('.setrow input') ?? [])];
  const next = cells[cells.indexOf(e.currentTarget) + 1];
  if (!next) return false;
  e.preventDefault();
  next.focus();
  return true;
}

/** The on-screen Enter key says "Next" on every box but the last, where it says "Done". */
export const cellHint = (isLast: boolean): 'next' | 'done' => (isLast ? 'done' : 'next');
