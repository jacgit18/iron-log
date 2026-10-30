import type { LogEntry } from '../types.ts';

// The entry that was saved last: the latest date, then the latest `updatedAt` stamp (older data has none).
const newest = (L: LogEntry[]) => L.reduce((a, e) => (e.d > a.d || (e.d === a.d && (e.updatedAt || '') > (a.updatedAt || '')) ? e : a));

// Exercise ids with logs, the one logged, ticked or edited most recently first; a tie falls back to the name so the order never jumps.
export function newestFirst(ids: string[], logs: Record<string, LogEntry[]>, nameOf: (id: string) => string) {
  const key = (id: string) => { const e = newest(logs[id]); return `${e.d}|${e.updatedAt || ''}`; };
  return ids.filter(id => logs[id]?.length).sort((a, b) => key(b).localeCompare(key(a)) || nameOf(a).localeCompare(nameOf(b)));
}
