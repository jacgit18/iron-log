import { sql, type Transaction } from 'kysely';
import type { DB } from '../db/types.ts';
import type { BodyEntryRow, LogEntryRow } from './support.ts';

// ADR 008: GET /api/sync?since=<seq>. The user's rows changed after the cursor, tombstones included, oldest change first.
// Each row carries its table, so every synced table shares the one feed and one cursor.
export const DEFAULT_PAGE = 200;
export const MAX_PAGE = 500;

export type SyncRow = (LogEntryRow & { table: 'log_entries' }) | (BodyEntryRow & { table: 'body_entries' });
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
  const edge = (
    await sql<{ seq: string }>`
      select seq from (
        select seq from log_entries where user_id = ${userId} and seq > ${since}
        union all
        select seq from body_entries where user_id = ${userId} and seq > ${since}
      ) changed order by seq offset ${limit - 1} limit 1`.execute(trx)
  ).rows[0];
  let logs = trx.selectFrom('log_entries').selectAll().where('user_id', '=', userId).where('seq', '>', since);
  let body = trx.selectFrom('body_entries').selectAll().where('user_id', '=', userId).where('seq', '>', since);
  if (edge) {
    logs = logs.where('seq', '<=', edge.seq);
    body = body.where('seq', '<=', edge.seq);
  }
  const rows: SyncRow[] = [
    ...(await logs.execute()).map(r => ({ table: 'log_entries' as const, ...r })),
    ...(await body.execute()).map(r => ({ table: 'body_entries' as const, ...r })),
  ].sort((a, b) => Number(BigInt(a.seq) - BigInt(b.seq)) || a.table.localeCompare(b.table) || Number(BigInt(a.id) - BigInt(b.id)));
  const cursor = rows.length ? rows[rows.length - 1]!.seq : since;
  const more = edge
    ? (
        await sql<{ more: boolean }>`
          select exists (select 1 from log_entries where user_id = ${userId} and seq > ${cursor})
              or exists (select 1 from body_entries where user_id = ${userId} and seq > ${cursor}) as more`.execute(trx)
      ).rows[0]!.more
    : false;
  return { rows, cursor, more };
}
