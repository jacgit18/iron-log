import type { Transaction } from 'kysely';
import type { DB } from '../db/types.ts';
import type { LogEntryRow } from './logSession.ts';

// ADR 008: GET /api/sync?since=<seq>. The user's rows changed after the cursor, tombstones included, oldest change first.
// Today only log_entries is synced; each row carries its table so the other tables can join the same feed.
export const DEFAULT_PAGE = 200;
export const MAX_PAGE = 500;

export type SyncRow = LogEntryRow & { table: 'log_entries' };
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
  const edge = await trx.selectFrom('log_entries').select('seq').where('user_id', '=', userId).where('seq', '>', since).orderBy('seq').offset(limit - 1).limit(1).executeTakeFirst();
  let query = trx.selectFrom('log_entries').selectAll().where('user_id', '=', userId).where('seq', '>', since).orderBy('seq').orderBy('id');
  if (edge) query = query.where('seq', '<=', edge.seq);
  const rows = await query.execute();
  const cursor = rows.length ? rows[rows.length - 1]!.seq : since;
  const more = edge ? !!(await trx.selectFrom('log_entries').select('id').where('user_id', '=', userId).where('seq', '>', cursor).limit(1).executeTakeFirst()) : false;
  return { rows: rows.map(r => ({ table: 'log_entries' as const, ...r })), cursor, more };
}
