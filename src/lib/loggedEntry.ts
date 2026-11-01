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
