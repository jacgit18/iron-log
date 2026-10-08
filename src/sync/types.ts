import type { ConfigDoc } from '../shared/config.js';
import type { ListItem, ListName } from '../shared/commands.js';
import type { BodyEntry, Boost, LibraryItem, LogEntry, ProgKey, Program, StretchWeek, Week } from '../types.ts';

/* ---------- Sync: the phone's copy of the server's rows ----------
   The app stores whole documents ("logs/squat", "weeks/2026-10-04", ...). The server stores rows. These types are the
   rows as the phone holds them (the mirror), in the app's own shapes. Phase D, increment D1: pure, no network. */

export type SyncTable = 'log_entries' | 'body_entries' | 'weeks' | 'stretch_weeks' | 'supplement_days' | 'programs' | 'config' | 'library_items' | 'list_items';

/** A row as the API sends it, in GET /api/sync and in command responses (snake_case, numbers as strings). */
export interface ServerRow {
  id: string;
  version: number;
  seq: string;
  deleted_at: string | null;
  [column: string]: unknown;
}

/** One supplements day: ounces per drink, the day's boost, and the supplements ticked off. */
export interface SupplementDay {
  water: number[];
  boost: Boost | null;
  taken: Record<string, true>;
}

interface Base {
  /** Identifies the row within the user and table (see rowKeyOf). */
  key: string;
  version: number;
  deleted: boolean;
  seq: string;
}

export type MirrorRow =
  | (Base & { table: 'log_entries'; exerciseId: string; entry: LogEntry })
  | (Base & { table: 'body_entries'; entry: BodyEntry })
  | (Base & { table: 'weeks'; week: Week })
  | (Base & { table: 'stretch_weeks'; week: StretchWeek })
  | (Base & { table: 'supplement_days'; day: string; record: SupplementDay })
  | (Base & { table: 'programs'; progKey: ProgKey; program: Omit<Program, 'key'> })
  | (Base & { table: 'config'; config: ConfigDoc })
  | (Base & { table: 'library_items'; item: LibraryItem })
  | (Base & { table: 'list_items'; list: ListName; position: number; item: ListItem });

/** The phone's copy of the server's rows, keyed by `${table}|${key}`. Tombstones are kept. */
export type Mirror = ReadonlyMap<string, MirrorRow>;

export const mirrorId = (table: SyncTable, key: string) => `${table}|${key}`;

/** What the app wants one row to be: a MirrorRow with no version, seq or tombstone yet. */
export type DesiredRow = MirrorRow extends infer R ? (R extends MirrorRow ? Omit<R, 'version' | 'deleted' | 'seq'> : never) : never;

export type CommandName =
  | 'log-session' | 'tick-card' | 'delete-entry'
  | 'log-body-weight' | 'delete-body-weight'
  | 'save-week' | 'delete-week' | 'save-stretch-week' | 'delete-stretch-week'
  | 'save-supplement-day' | 'delete-supplement-day'
  | 'save-program' | 'delete-program' | 'save-config'
  | 'save-library-item' | 'delete-library-item'
  | 'save-list-item' | 'delete-list-item';

/** One request to POST /api/commands/<name>, the envelope's pieces plus the row it concerns. */
export interface PlannedCommand {
  name: CommandName;
  table: SyncTable;
  /** The row's key in the mirror (see rowKeyOf), so the answer can be matched to it. */
  rowKey: string;
  clientId: string;
  baseVersion: number | null;
  input: unknown;
}
