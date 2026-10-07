import { sql, type Transaction } from 'kysely';
import { validateDeleteEntry } from '../../src/shared/commands.ts';
import type { DB } from '../db/types.ts';
import { lockUser, nextSeq, parseEnvelope, refuse, type LogEntryRow } from './support.ts';

// ADR 003 (soft delete, FM-05) and 008. A delete is a versioned write: it carries the version the phone saw.
// - The row is already a tombstone: success, and the tombstone is returned. This covers a retry and a delete made on
//   another device first; the user's goal is met either way.
// - The row changed since the phone saw it: refused with 409 and the current row, so a delete never silently wins over
//   an edit made after the version it was based on. The phone shows the edit and asks again.
// - No such row: refused with 409, as log-session does for an edit.

export type DeleteEntryResult =
  | { status: 200; body: { rows: LogEntryRow[]; cursor: string } }
  | { status: 409 | 422; body: { refused: string; current: LogEntryRow | null } };

export async function deleteEntry(trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null): Promise<DeleteEntryResult> {
  const env = parseEnvelope(body);
  if (!env) {
    await refuse(trx, userId, 'delete-entry', { input: body }, 'bad-envelope', clientVersion);
    return { status: 422, body: { refused: 'bad-envelope', current: null } };
  }
  const input = validateDeleteEntry(env.input);
  if (!input || env.baseVersion === null) {
    await refuse(trx, userId, 'delete-entry', env, 'invalid-input', clientVersion);
    return { status: 422, body: { refused: 'invalid-input', current: null } };
  }

  await lockUser(trx, userId);
  const existing = (await trx.selectFrom('log_entries').selectAll().where('user_id', '=', userId).where('client_id', '=', input.entryId).executeTakeFirst()) ?? null;
  if (existing?.deleted_at) return { status: 200, body: { rows: [existing], cursor: existing.seq } };

  const refusal = !existing ? 'not-found' : existing.version !== env.baseVersion ? 'stale' : null;
  if (refusal) {
    await refuse(trx, userId, 'delete-entry', env, refusal, clientVersion);
    return { status: 409, body: { refused: refusal, current: existing } };
  }

  const seq = await nextSeq(trx, userId);
  const row = await trx
    .updateTable('log_entries')
    .set({ deleted_at: sql`now()`, version: env.baseVersion + 1, seq, updated_at: sql`now()` })
    .where('id', '=', existing!.id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return { status: 200, body: { rows: [row], cursor: seq } };
}
