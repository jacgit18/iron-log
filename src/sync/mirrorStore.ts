import { pathsOf } from './documents.js';
import { applyRows, idOfRow } from './rows.js';
import type { Mirror, MirrorRow, ServerRow, SyncTable } from './types.js';

/* ---------- The phone's copy of the server's rows, kept across reloads ----------
   Holds only what the server has confirmed: its rows, with their versions and tombstones, and the cursor to pull from.
   What the user wrote and the server has not taken yet is not here (the queue holds that), so losing or distrusting
   this copy only costs a full pull. It is read while offline, and it is where the base versions for edits come from.

   Kept in the browser's localStorage as one entry, the same place the app keeps its data today (the brief's decision 2). */

export const MIRROR_KEY = 'sync/mirror';
const FORMAT = 1;

/** The slice of storage the store needs; `LS` from lib/storage fits it. */
export interface Storage {
  get(key: string): unknown;
  /** False when the browser refused the write (storage full or blocked). */
  set(key: string, value: unknown): boolean;
  remove(key: string): void;
}

const TABLES: readonly SyncTable[] = ['log_entries', 'body_entries', 'weeks', 'stretch_weeks', 'supplement_days', 'programs', 'config', 'library_items', 'list_items'];
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// A row read back from storage. The shape is checked just enough that code reading it cannot crash on a damaged entry;
// a row that fails is dropped, and the cursor goes back to the start so the next pull brings it again.
function isMirrorRow(v: unknown): v is MirrorRow {
  if (!isObject(v) || !TABLES.includes(v.table as SyncTable)) return false;
  if (typeof v.key !== 'string' || !v.key || !Number.isInteger(v.version) || (v.version as number) < 1 || typeof v.deleted !== 'boolean' || typeof v.seq !== 'string' || !/^\d+$/.test(v.seq)) return false;
  switch (v.table) {
    case 'log_entries': return typeof v.exerciseId === 'string' && isObject(v.entry) && typeof v.entry.d === 'string';
    case 'body_entries': return isObject(v.entry) && typeof v.entry.wk === 'string' && typeof v.entry.w === 'number';
    case 'weeks': case 'stretch_weeks': return isObject(v.week);
    case 'supplement_days': return typeof v.day === 'string' && isObject(v.record) && Array.isArray(v.record.water);
    case 'programs': return (v.progKey === 'A' || v.progKey === 'B') && isObject(v.program);
    case 'config': return isObject(v.config);
    case 'library_items': return isObject(v.item) && typeof v.item.id === 'string';
    case 'list_items': return typeof v.list === 'string' && Number.isInteger(v.position) && isObject(v.item);
    default: return false;
  }
}

/** What changed when rows were applied, and the document paths that need a fresh snapshot. */
export interface Applied {
  changed: MirrorRow[];
  paths: string[];
}

/** `storage` is the browser's (`LS` from lib/storage) in the app, a plain object in tests. */
export function createMirrorStore(storage: Storage) {
  let rows: Map<string, MirrorRow> = new Map();
  let cursor = '0';
  let persisted = true;
  let dropped = 0;
  let pulled = false;
  // The account's data epoch (it goes up when the data is erased, migration 010). A copy saved before epochs existed is epoch 1,
  // which is what every account started with.
  let epoch = '1';

  // Read what an earlier session saved. Anything unreadable means "start from nothing and pull again", never a crash.
  const saved = storage.get(MIRROR_KEY);
  if (isObject(saved) && saved.v === FORMAT && typeof saved.cursor === 'string' && /^\d+$/.test(saved.cursor) && Array.isArray(saved.rows)) {
    for (const r of saved.rows) {
      if (isMirrorRow(r)) rows.set(idOfRow(r), r);
      else dropped++;
    }
    cursor = dropped ? '0' : saved.cursor;
    pulled = !dropped && saved.pulled === true;
    if (typeof saved.epoch === 'string' && /^\d+$/.test(saved.epoch)) epoch = saved.epoch;
  } else if (saved != null) {
    dropped = 1; // present but not ours: ignore it
  }

  const persist = () => {
    persisted = storage.set(MIRROR_KEY, { v: FORMAT, cursor, pulled, epoch, rows: [...rows.values()] });
  };

  function diff(before: Mirror, after: Mirror): Applied {
    const changed: MirrorRow[] = [];
    for (const [id, row] of after) {
      const was = before.get(id);
      if (!was || was.version !== row.version || was.deleted !== row.deleted) changed.push(row);
    }
    return { changed, paths: [...new Set(changed.flatMap(pathsOf))] };
  }

  return {
    /** The rows, as of now. A new map after every change, so a caller may keep this one as a snapshot. */
    rows: (): Mirror => rows,
    /** Where to pull from. */
    cursor: () => cursor,
    /** False when the browser refused the last write: the copy is only in memory and a reload would lose it. */
    persisted: () => persisted,
    /** True once a pull has finished on this device. Until then the mirror may be missing rows the server has, so the app
     *  must not show it as the user's data. */
    hasPulled: () => pulled,
    /** True when what was in storage could not be used, so a full pull is on its way. */
    recovered: () => dropped > 0,

    /** Which reset of the account's data this copy belongs to. */
    epoch: () => epoch,

    /** The account's data was erased on the server: forget every row but keep the cursor. Everything of the new epoch has a higher seq
     *  than anything of the old one, so the next page from this cursor is the whole new account. Not "ready" until that page arrives. */
    reset(next: string) {
      rows = new Map();
      pulled = false;
      epoch = next;
      persist();
    },

    /** Takes rows the server sent (a command's answer, a conflict's current row) without moving the pull cursor. */
    apply(table: SyncTable, serverRows: ServerRow[]): Applied {
      const before = rows;
      rows = applyRows(rows, table, serverRows);
      const out = diff(before, rows);
      if (out.changed.length) persist();
      return out;
    },

    /** Takes one page of the pull and moves the cursor with it, in a single write, so the two never disagree. */
    applyPage(byTable: Partial<Record<SyncTable, ServerRow[]>>, nextCursor: string): Applied {
      const before = rows;
      for (const table of TABLES) if (byTable[table]?.length) rows = applyRows(rows, table, byTable[table]!);
      cursor = nextCursor;
      pulled = true;
      persist();
      return diff(before, rows);
    },

    /** Forgets everything (signing out, or a deliberate full re-pull). */
    clear() {
      rows = new Map();
      cursor = '0';
      dropped = 0;
      pulled = false;
      storage.remove(MIRROR_KEY);
      persisted = true;
    },
  };
}

export type MirrorStore = ReturnType<typeof createMirrorStore>;
