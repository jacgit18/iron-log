import type { LogEntry } from '../types.ts';

// The session logged for one card in one week (a check-off logs a planned one, the Log sheet a real one), for the Log sheet to edit.
// Newest first, so a card with two entries opens the later one.
export function loggedEntryFor(entries: LogEntry[] | undefined, slotId: string, wk: string, realOnly = false): LogEntry | null {
  const mine = (entries || []).filter(e => e.slot === slotId && e.wk === wk && !(realOnly && e.auto));
  if (!mine.length) return null;
  return mine.reduce((a, b) => (b.d >= a.d ? b : a)); // sort-ok: ISO date strings
}

// Which session the Log sheet opens to edit: a done card's logged session, or a skipped card's own session (not the planned numbers a
// check-off logged, which go with the skip). Anything else gets the blank form.
export function sheetEntryFor(entries: LogEntry[] | undefined, slotId: string, wk: string, done: boolean, skipped: boolean): LogEntry | null {
  if (done) return loggedEntryFor(entries, slotId, wk);
  if (skipped) return loggedEntryFor(entries, slotId, wk, true);
  return null;
}

/** The word on a card's Log button: Edit when the exercise is checked off and its logged session is there to change, else Log. A skipped card is always
 *  Log (its button and sheet stay as they were, owner 2026-11-01). */
export function logButtonLabel(entries: LogEntry[] | undefined, slotId: string, wk: string, done: boolean, skipped: boolean): 'Edit' | 'Log' {
  return !skipped && done && sheetEntryFor(entries, slotId, wk, done, skipped) ? 'Edit' : 'Log';
}

/** The second line of the Edit mode banner on the sheet of a checked-off card. `when` is the session's short date. */
export const editModeText = (when: string): string => `You are changing the session logged ${when}`;
