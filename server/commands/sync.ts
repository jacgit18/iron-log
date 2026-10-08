import { sql, type Transaction } from 'kysely';
import type { DB } from '../db/types.ts';
import type { BodyEntryRow, ConfigRow, LibraryItemRow, ListItemRow, LogEntryRow, ProgramRow, StretchWeekRow, SupplementDayRow, WeekRow } from './support.ts';

// ADR 008: GET /api/sync?since=<seq>. The user's rows changed after the cursor, tombstones included, oldest change first.
// Each row carries its table, so every synced table shares the one feed and one cursor.
export const DEFAULT_PAGE = 200;
export const MAX_PAGE = 500;

export type SyncRow =
  | (LogEntryRow & { table: 'log_entries' })
  | (BodyEntryRow & { table: 'body_entries' })
  | (WeekRow & { table: 'weeks' })
  | (StretchWeekRow & { table: 'stretch_weeks' })
  | (SupplementDayRow & { table: 'supplement_days' })
  | (ProgramRow & { table: 'programs' })
  | (ConfigRow & { table: 'config' })
  | (LibraryItemRow & { table: 'library_items' })
  | (ListItemRow & { table: 'list_items' });
const TABLES = ['log_entries', 'body_entries', 'weeks', 'stretch_weeks', 'supplement_days', 'programs', 'config', 'library_items', 'list_items'] as const;
export interface SyncPage {
  rows: SyncRow[];
  /** Send this as `since` next time. Equal to `since` when nothing changed. */
  cursor: string;
  /** True when more changes exist past this page: ask again with the new cursor. */
  more: boolean;
}

export function parseSince(value: unknown): string | null {
  if (value === undefined) return '0';
  return typeof value === 'string' && /^\d{1,18}$/.test(value) ? value : null;
}

export function parseLimit(value: unknown): number | null {
  if (value === undefined) return DEFAULT_PAGE;
  if (typeof value !== 'string' || !/^\d{1,5}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 && n <= MAX_PAGE ? n : null;
}

export async function syncPage(trx: Transaction<DB>, userId: string, since: string, limit: number): Promise<SyncPage> {
  // The page ends at the seq of its last row and includes every row with that seq, so one command's rows are never split
  // across two pages and a cursor never lands in the middle of a command.
  const changedSince = (after: string) => TABLES.map(t => sql`select seq from ${sql.table(t)} where user_id = ${userId} and seq > ${after}`);
  const edge = (await sql<{ seq: string }>`select seq from (${sql.join(changedSince(since), sql` union all `)}) changed order by seq offset ${limit - 1} limit 1`.execute(trx)).rows[0];
  const pulled = await Promise.all(
    TABLES.map(async table => {
      let q = trx.selectFrom(table).selectAll().where('user_id', '=', userId).where('seq', '>', since);
      if (edge) q = q.where('seq', '<=', edge.seq);
      return (await q.execute()).map(r => ({ table, ...r }) as SyncRow);
    }),
  );
  const rows = pulled.flat().sort((a, b) => Number(BigInt(a.seq) - BigInt(b.seq)) || a.table.localeCompare(b.table) || Number(BigInt(a.id) - BigInt(b.id)));
  const cursor = rows.length ? rows[rows.length - 1]!.seq : since;
  const more = edge ? (await sql<{ more: boolean }>`select exists (${sql.join(changedSince(cursor), sql` union all `)}) as more`.execute(trx)).rows[0]!.more : false;
  return { rows, cursor, more };
}
