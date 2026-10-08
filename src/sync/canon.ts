import type { LogEntry } from '../types.ts';
import type { DesiredRow, MirrorRow } from './types.js';

/* ---------- Is this row the same as that row? ----------
   The server stores numbers at fixed precision (weight 4 decimals, reps and holds 2) and drops what the app does not
   keep (a body weight's updatedAt, a log entry's updatedAt only as a diagnostic). Comparing the raw values would see a
   difference after every save and resend forever, so rows are compared in their canonical form. */

export const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

// JSON with the keys in order, so two objects that hold the same things stringify the same.
export function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v));
}

const num = (v: unknown, places: number) => (v == null || v === '' || !Number.isFinite(Number(v)) ? undefined : round(Number(v), places));

// An entry as the database keeps it. The id is the row's key, updatedAt is not content, an unchecked flag is no flag.
export function canonEntry(e: LogEntry) {
  const sets = Array.isArray(e.sets) && e.sets.length ? e.sets.map(s => ({ w: s.w ?? undefined, r: s.r ?? undefined, sec: s.sec ?? undefined })) : undefined;
  return {
    d: e.d,
    ph: e.ph || undefined,
    w: num(e.w, 4),
    s: e.s == null || (e.s as unknown) === '' ? undefined : Math.round(Number(e.s)),
    r: num(e.r, 2),
    sec: num(e.sec, 2),
    sets,
    n: e.n || undefined,
    slot: e.slot || undefined,
    wk: e.wk || undefined,
    auto: e.auto ? true : undefined,
  };
}

/** The part of a row that makes it "the same" or "changed" when two copies are compared. */
export function canonOf(row: MirrorRow | DesiredRow): string {
  switch (row.table) {
    case 'log_entries': return stable(canonEntry(row.entry));
    case 'body_entries': return stable({ wk: row.entry.wk, d: row.entry.d, w: round(row.entry.w, 4) });
    case 'weeks': return stable(row.week);
    case 'stretch_weeks': return stable(row.week);
    case 'supplement_days': return stable({ water: row.record.water.map(n => round(n, 1)), boost: row.record.boost ?? null, taken: row.record.taken });
    case 'programs': return stable(row.program);
    case 'config': return stable(row.config);
    case 'library_items': return stable(row.item);
    case 'list_items': return stable({ position: row.position, item: row.item });
  }
}
