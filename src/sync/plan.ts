import { canonOf } from './canon.js';
import { desiredRows, scopeRows, type PathKind } from './documents.js';
import { mirrorId, type DesiredRow, type Mirror, type MirrorRow, type PlannedCommand } from './types.js';

/* ---------- From a changed document to commands ----------
   planCommands compares the document the store wants with the rows the server is known to hold (the mirror) and lists
   the smallest set of commands that makes them equal. It is computed when the queue flushes, so a write that was
   queued twice is one comparison, and a retry after a crash plans only what is still missing.

   Order: deletes, then edits, then creates. A check-off replaced by a hand-logged session (or a redone check-off) is a
   delete plus a create; deleting first lets the server accept the create, and a delete the server already did for
   itself (rule 2) is a success that changes nothing. */

const idOf = (r: Pick<DesiredRow, 'table' | 'key'>) => mirrorId(r.table, r.key);

const trim = (id: string) => id.slice(0, 100);
const make = (name: PlannedCommand['name'], row: Pick<DesiredRow, 'table' | 'key'>, baseVersion: number | null, input: unknown, clientId?: string): PlannedCommand => ({
  name, table: row.table, rowKey: row.key, baseVersion, input,
  clientId: clientId ?? trim(`${name}:${baseVersion ?? 'new'}:${row.key}`),
});

// The command that makes the server's row equal this one, as a create (baseVersion null) or an edit (the version seen).
function save(row: DesiredRow, baseVersion: number | null): PlannedCommand {
  switch (row.table) {
    case 'log_entries':
      // A log entry's client id is the row's key, so the id is the command's id. A check-off is its own command.
      return make(row.entry.auto ? 'tick-card' : 'log-session', row, baseVersion, { exerciseId: row.exerciseId, entry: row.entry }, row.key);
    case 'body_entries': return make('log-body-weight', row, baseVersion, { wk: row.entry.wk, d: row.entry.d, w: row.entry.w });
    case 'weeks': return make('save-week', row, baseVersion, { weekStart: row.key, week: row.week });
    case 'stretch_weeks': return make('save-stretch-week', row, baseVersion, { weekStart: row.key, week: row.week });
    case 'supplement_days': return make('save-supplement-day', row, baseVersion, { day: row.day, ...row.record });
    case 'programs': return make('save-program', row, baseVersion, { key: row.progKey, program: row.program });
    case 'config': return make('save-config', row, baseVersion, { config: row.config });
    case 'library_items': return make('save-library-item', row, baseVersion, { item: row.item });
    case 'list_items': return make('save-list-item', row, baseVersion, { list: row.list, item: row.item, position: row.position });
  }
}

// The delete command for a row the server holds. The config has none (an empty config is saved instead).
function remove(row: MirrorRow): PlannedCommand | null {
  const id = (name: PlannedCommand['name'], input: unknown) => make(name, row, row.version, input);
  switch (row.table) {
    case 'log_entries': return id('delete-entry', { entryId: row.key });
    case 'body_entries': return id('delete-body-weight', { wk: row.key });
    case 'weeks': return id('delete-week', { weekStart: row.key });
    case 'stretch_weeks': return id('delete-stretch-week', { weekStart: row.key });
    case 'supplement_days': return id('delete-supplement-day', { day: row.key });
    case 'programs': return id('delete-program', { key: row.key });
    case 'library_items': return id('delete-library-item', { id: row.key });
    case 'list_items': return id('delete-list-item', { list: row.list, id: row.key.slice(row.list.length + 1) });
    case 'config': return null;
  }
}

const isCheckOff = (r: DesiredRow | MirrorRow) => r.table === 'log_entries' && !!r.entry.auto;
const byKey = (a: PlannedCommand, b: PlannedCommand) => (a.rowKey < b.rowKey ? -1 : a.rowKey > b.rowKey ? 1 : 0);

/** The commands that bring the server's rows for this path in line with `doc`. Empty when they already agree. */
export function planCommands(kind: PathKind, doc: unknown, mirror: Mirror): PlannedCommand[] {
  const desired = desiredRows(kind, doc, mirror);
  const wanted = new Set(desired.map(idOf));
  const deletes: PlannedCommand[] = [];
  const edits: PlannedCommand[] = [];
  const creates: PlannedCommand[] = [];

  for (const have of scopeRows(kind, mirror)) {
    if (have.deleted || wanted.has(idOf(have))) continue;
    const cmd = remove(have);
    if (cmd) deletes.push(cmd);
  }

  for (const row of desired) {
    const have = mirror.get(idOf(row));
    if (!have || have.deleted) { creates.push(save(row, null)); continue; }
    if (canonOf(have) === canonOf(row)) continue;
    // A check-off is not edited in place: the old one goes and a new one is made (the server refuses to edit one).
    if (isCheckOff(row) || isCheckOff(have)) {
      const gone = remove(have);
      if (gone) deletes.push(gone);
      creates.push(save(row, null));
    } else edits.push(save(row, have.version));
  }

  return [...deletes.sort(byKey), ...edits.sort(byKey), ...creates.sort(byKey)];
}

/** The commands for removing a whole path (the store's removeDoc). The config document is reset to its water settings instead. */
export function planDelete(kind: PathKind, mirror: Mirror): PlannedCommand[] {
  if (kind.kind === 'config') return planCommands(kind, {}, mirror);
  const cmds = scopeRows(kind, mirror).filter(r => !r.deleted).map(remove).filter((c): c is PlannedCommand => !!c);
  return cmds.sort(byKey);
}
