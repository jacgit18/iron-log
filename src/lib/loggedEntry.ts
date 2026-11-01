import type { LogEntry } from '../types.ts';

// The session logged for one card in one week (a check-off logs a planned one, the Log sheet a real one), for the Log sheet to edit.
// Newest first, so a card with two entries opens the later one.
export function loggedEntryFor(entries: LogEntry[] | undefined, slotId: string, wk: string): LogEntry | null {
  const mine = (entries || []).filter(e => e.slot === slotId && e.wk === wk);
  if (!mine.length) return null;
  return mine.reduce((a, b) => (b.d >= a.d ? b : a)); // sort-ok: ISO date strings
}
