import { normConfigDoc } from '../shared/config.js';
import { normExperimentItem, normStretchExperimentItem, normStretchItem, normSupplementItem } from '../shared/listItems.js';
import { normStretchWeek } from '../shared/stretchWeek.js';
import { normBoost, normTakenDay, normWaterDay } from '../shared/supplementDay.js';
import { normLibrary } from '../shared/validate.js';
import { normWeek } from '../shared/week.js';
import type { BodyEntry, LogEntry, LogSet } from '../types.ts';
import { mirrorId, type MirrorRow, type ServerRow, type SyncTable } from './types.js';

/* ---------- A server row, in the app's own shapes ----------
   fromServerRow turns the API's snake_case row (numbers as strings, nulls for what is absent) into a MirrorRow whose
   value is what the store holds. The values were cleaned by the same validators on the way in, so they are cleaned
   again here only where the app expects a particular shape. */

const present = <T>(v: T | null | undefined): v is T => v !== null && v !== undefined;
const asNumber = (v: unknown) => (present(v) && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

function entryFrom(row: ServerRow): LogEntry {
  const e: LogEntry = { d: String(row.d) };
  if (present(row.phase)) e.ph = row.phase as LogEntry['ph'];
  const w = asNumber(row.weight_lb); if (w !== undefined) e.w = w;
  const s = asNumber(row.sets_count); if (s !== undefined) e.s = s;
  const r = asNumber(row.reps); if (r !== undefined) e.r = r;
  const sec = asNumber(row.hold_sec); if (sec !== undefined) e.sec = sec;
  if (Array.isArray(row.sets) && row.sets.length) e.sets = row.sets as LogSet[];
  if (present(row.note)) e.n = String(row.note);
  if (present(row.slot)) e.slot = String(row.slot);
  if (present(row.wk)) e.wk = String(row.wk);
  e.id = String(row.client_id);
  if (row.auto === true) e.auto = true;
  if (present(row.client_updated_at)) e.updatedAt = new Date(String(row.client_updated_at)).toISOString();
  return e;
}

export function fromServerRow(table: SyncTable, row: ServerRow): MirrorRow {
  const base = { version: row.version, deleted: row.deleted_at !== null, seq: String(row.seq) };
  switch (table) {
    case 'log_entries': return { ...base, table, key: String(row.client_id), exerciseId: String(row.exercise_id), entry: entryFrom(row) };
    case 'body_entries': { const entry: BodyEntry = { wk: String(row.wk), d: String(row.d), w: Number(row.weight_lb) }; return { ...base, table, key: entry.wk, entry }; }
    case 'weeks': return { ...base, table, key: String(row.week_start), week: normWeek(row.data) };
    case 'stretch_weeks': return { ...base, table, key: String(row.week_start), week: normStretchWeek(row.data) };
    case 'supplement_days':
      return { ...base, table, key: String(row.day), day: String(row.day), record: { water: normWaterDay(row.water), boost: normBoost(row.boost), taken: normTakenDay(row.taken) } };
    case 'programs': return { ...base, table, key: String(row.key), progKey: row.key as 'A' | 'B', program: row.data as never };
    case 'config': return { ...base, table, key: 'config', config: normConfigDoc(row.data) ?? {} };
    case 'library_items': { const item = normLibrary([row.data])[0]; return { ...base, table, key: String(row.client_id), item: item ?? (row.data as never) }; }
    case 'list_items': {
      const list = row.list as 'stretch' | 'stretch_experiment' | 'experiment' | 'supplement_item';
      const clean = { stretch: normStretchItem, stretch_experiment: normStretchExperimentItem, experiment: normExperimentItem, supplement_item: (x: unknown) => normSupplementItem(x) }[list](row.data);
      return { ...base, table, key: `${list}/${row.client_id}`, list, position: Number(row.position), item: clean ?? (row.data as never) };
    }
  }
}

/** Where a row is kept in the mirror. */
export const idOfRow = (row: Pick<MirrorRow, 'table' | 'key'>) => mirrorId(row.table, row.key);

/** Puts server rows into a copy of the mirror, keeping only the newest version of each row. */
export function applyRows(mirror: ReadonlyMap<string, MirrorRow>, table: SyncTable, rows: ServerRow[]): Map<string, MirrorRow> {
  const next = new Map(mirror);
  for (const raw of rows) {
    const row = fromServerRow(table, raw);
    const have = next.get(idOfRow(row));
    if (!have || row.version >= have.version) next.set(idOfRow(row), row);
  }
  return next;
}
