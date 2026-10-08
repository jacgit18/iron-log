import { entryId } from '../lib/export.js';
import type { LogEntry } from '../types.js';
import { desiredRows, parsePath } from './documents.js';
import { createCommand } from './plan.js';
import type { DesiredRow, Mirror, MirrorRow, PlannedCommand, SyncTable } from './types.js';

/* ---------- The one-time upload of what a phone held before it had an account (Phase E) ----------
   Before accounts, every document lived in the browser's own storage, one entry per path (logs/squat, weeks/2026-10-04, ...).
   Turning them into rows uses the same rules as a normal save (documents.ts), so nothing here decides what a row is. What is
   special to the upload is only this:
     - every row is a create, sent in one request that the server runs as one transaction on an empty account;
     - two entries must never share an id (the server refuses the whole upload if they do). Old entries without an id get one
       from a hash of their values, which ignores the exercise, so the same values on the same day for two exercises collide:
       the later one gets a "-2" (then "-3", ...) in input order, so the same data always gives the same ids;
     - a check-off that a hand-logged session already replaces (the board's rule 2), or a second check-off for one card and
       week, is left out, because the server would not take it as a create;
     - the GitHub backup settings never leave the device (the config document drops them on its own). */

export interface LegacySummary {
  entries: number;
  checkOffs: number;
  bodyWeights: number;
  weeks: number;
  stretchWeeks: number;
  supplementDays: number;
  programs: number;
  library: number;
  lists: number;
  config: number;
}

export interface LegacyPlan {
  commands: PlannedCommand[];
  summary: LegacySummary;
  /** Entries whose id was changed because another had the same one. */
  renamed: number;
  /** Check-offs left out because a session or an earlier check-off already covers the card. */
  skipped: number;
}

/** The documents the browser holds, by path. Only paths the sync knows (parsePath) are taken: display options and such stay. */
export function legacyDocs(keys: readonly string[], read: (path: string) => unknown): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const path of [...keys].sort()) {
    if (!parsePath(path)) continue;
    const doc = read(path);
    if (doc && typeof doc === 'object') out.set(path, doc);
  }
  return out;
}

const sim = (row: DesiredRow): MirrorRow => ({ ...row, version: 1, deleted: false, seq: '0' }) as MirrorRow;
const idOf = (r: Pick<DesiredRow, 'table' | 'key'>) => `${r.table}|${r.key}`;

export function planLegacy(docs: ReadonlyMap<string, unknown>): LegacyPlan {
  // The water goal and mode live in the config row, which both the supplements and the config documents write: the config
  // document goes last and sees what supplements already put there, as a normal sync does.
  const paths = [...docs.keys()].sort().sort((a, b) => Number(a === 'config/main') - Number(b === 'config/main'));
  // Log entries are kept as a list, not by id: two exercises may hold entries with the same id, and both must reach the renaming below.
  const rows = new Map<string, DesiredRow>();
  const entries: DesiredRow[] = [];
  let mirror: Mirror = new Map();
  for (const path of paths) {
    const kind = parsePath(path);
    if (!kind) continue;
    const next = new Map(mirror);
    for (const row of desiredRows(kind, docs.get(path), mirror)) {
      if (row.table === 'log_entries') entries.push(row);
      else rows.set(idOf(row), row);
      next.set(`${idOf(row)}${row.table === 'log_entries' ? `|${row.exerciseId}` : ''}`, sim(row));
    }
    mirror = next;
  }

  const all = [...entries, ...rows.values()];
  // 1. Check-offs: drop what the server would not take as a create.
  const card = (e: LogEntry, exerciseId: string) => (e.slot && e.wk ? `${exerciseId}|${e.slot}|${e.wk}` : null);
  const handLogged = new Set<string>();
  for (const r of all) if (r.table === 'log_entries' && !r.entry.auto) { const c = card(r.entry, r.exerciseId); if (c) handLogged.add(c); }
  let skipped = 0;
  const seenCheckOff = new Set<string>();
  const kept = all.filter(r => {
    if (r.table !== 'log_entries' || !r.entry.auto) return true;
    const c = card(r.entry, r.exerciseId);
    if (!c) return true;
    if (handLogged.has(c) || seenCheckOff.has(c)) { skipped++; return false; }
    seenCheckOff.add(c);
    return true;
  });

  // 2. Ids: unique across every exercise, the later one renamed.
  const used = new Set<string>();
  let renamed = 0;
  const final = kept.map((r): DesiredRow => {
    if (r.table !== 'log_entries') return r;
    let key = r.key || entryId(r.entry);
    if (used.has(key)) {
      const base = key.slice(0, 96);
      let n = 2;
      while (used.has(`${base}-${n}`)) n++;
      key = `${base}-${n}`;
      renamed++;
    }
    used.add(key);
    return key === r.key ? r : { ...r, key, entry: { ...r.entry, id: key } };
  });

  const count = (table: SyncTable, pred: (r: DesiredRow) => boolean = () => true) => final.filter(r => r.table === table && pred(r)).length;
  const isAuto = (r: DesiredRow) => r.table === 'log_entries' && !!r.entry.auto;
  const summary: LegacySummary = {
    entries: count('log_entries', r => !isAuto(r)),
    checkOffs: count('log_entries', isAuto),
    bodyWeights: count('body_entries'),
    weeks: count('weeks'),
    stretchWeeks: count('stretch_weeks'),
    supplementDays: count('supplement_days'),
    programs: count('programs'),
    library: count('library_items'),
    lists: count('list_items'),
    config: count('config'),
  };
  return { commands: final.map(createCommand), summary, renamed, skipped };
}

/** One line a person can read: what the upload holds. */
export function describeLegacy(s: LegacySummary): string {
  const n = (count: number, one: string, many = `${one}s`) => (count ? `${count} ${count === 1 ? one : many}` : '');
  return [
    n(s.entries, 'logged session'), n(s.checkOffs, 'check-off'), n(s.bodyWeights, 'body weight'), n(s.weeks, 'week'),
    n(s.programs, 'program'), n(s.library, 'saved program version'), n(s.supplementDays, 'supplement day'),
  ].filter(Boolean).join(', ') || 'your settings and lists';
}
