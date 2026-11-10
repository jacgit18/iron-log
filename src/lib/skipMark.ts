import type { Logs } from '../types.ts';

/** The note on the entry a skip writes for the day it was skipped (an auto entry with no numbers). */
export const SKIPPED_NOTE = 'Skipped';

/** True for the entry a skip writes: it says "skipped" in an exercise's history but is not a session, so counts, charts and Last ignore it. */
export const isSkipMark = (e: { auto?: boolean; n?: string } | null | undefined): boolean => !!e && !!e.auto && e.n === SKIPPED_NOTE;

/** The logs without skip entries, dropping an exercise that has nothing else (for the stats that count sessions). */
export function withoutSkipMarks(logs: Logs): Logs {
  const out: Logs = {};
  Object.keys(logs).forEach(id => { const L = (logs[id] || []).filter(e => !isSkipMark(e)); if (L.length) out[id] = L; });
  return out;
}
