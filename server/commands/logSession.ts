import { sql, type Transaction } from 'kysely';
import { validateLogSession, type LogSessionInput } from '../../src/shared/commands.ts';
import type { DB } from '../db/types.ts';
import { lockUser, nextSeq, parseEnvelope, refuse, type LogEntryRow } from './support.ts';

// ADR 003 and 008: one command, one transaction. A create carries baseVersion null; an edit carries the version the
// phone saw; a restore of a deleted entry carries the tombstone's version. A retry of a create returns the row it made. A stale edit, an edit of a deleted row or of a row that does
// not exist is refused with 409 and the current row, and every refusal is written to refused_writes (FM-22).

export type { LogEntryRow };

export type LogSessionResult =
  | { status: 200 | 201; body: { rows: LogEntryRow[]; cursor: string } }
  | { status: 409 | 422; body: { refused: string; current: LogEntryRow | null } };

function columns({ exerciseId, entry }: LogSessionInput) {
  return {
    exercise_id: exerciseId,
    d: entry.d,
    phase: entry.ph ?? null,
    weight_lb: entry.w ?? null,
    sets_count: entry.s ?? null,
    reps: entry.r ?? null,
    hold_sec: entry.sec ?? null,
    sets: entry.sets ? JSON.stringify(entry.sets) : null,
    note: entry.n ?? null,
    slot: entry.slot ?? null,
    wk: entry.wk ?? null,
    auto: false,
    client_updated_at: entry.updatedAt ?? null,
  };
}

// Rule 2 (backend-data-rules.md section 3): a hand-logged session replaces the check-off for the same card and week. The
// check-off becomes a tombstone in the same command, so it shares the new row's seq and the pull feed delivers both.
async function replaceCheckOff(trx: Transaction<DB>, userId: string, input: LogSessionInput, seq: string): Promise<LogEntryRow[]> {
  const { slot, wk } = input.entry;
  if (!slot || !wk) return [];
  return trx
    .updateTable('log_entries')
    .set({ deleted_at: sql`now()`, version: sql`version + 1`, seq, updated_at: sql`now()` })
    .where('user_id', '=', userId)
    .where('exercise_id', '=', input.exerciseId)
    .where('slot', '=', slot)
    .where('wk', '=', wk)
    .where('auto', '=', true)
    .where('deleted_at', 'is', null)
    .returningAll()
    .execute();
}

export async function logSession(trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null): Promise<LogSessionResult> {
  const env = parseEnvelope(body);
  if (!env) {
    await refuse(trx, userId, 'log-session', { input: body }, 'bad-envelope', clientVersion);
    return { status: 422, body: { refused: 'bad-envelope', current: null } };
  }
  const input = validateLogSession(env.input);
  if (!input) {
    await refuse(trx, userId, 'log-session', env, 'invalid-input', clientVersion);
    return { status: 422, body: { refused: 'invalid-input', current: null } };
  }
  // A check-off is made by tick-card (Phase C), never by hand-logging.
  if (input.entry.auto) {
    await refuse(trx, userId, 'log-session', env, 'check-off-not-allowed', clientVersion);
    return { status: 422, body: { refused: 'check-off-not-allowed', current: null } };
  }

  await lockUser(trx, userId);
  const existing = (await trx.selectFrom('log_entries').selectAll().where('user_id', '=', userId).where('client_id', '=', env.clientId).executeTakeFirst()) ?? null;

  const seq = () => nextSeq(trx, userId);

  if (env.baseVersion === null) {
    if (existing) return { status: 200, body: { rows: [existing], cursor: existing.seq } };
    const next = await seq();
    const row = await trx.insertInto('log_entries').values({ user_id: userId, client_id: env.clientId, seq: next, ...columns(input) }).returningAll().executeTakeFirstOrThrow();
    const replaced = await replaceCheckOff(trx, userId, input, next);
    return { status: 201, body: { rows: [row, ...replaced], cursor: next } };
  }

  // A deleted entry is brought back only by a write that names the tombstone's own version: the phone saw the deletion and
  // chose to restore it (the board's Undo). An edit based on an earlier version is still refused with the tombstone (FM-05),
  // and a create with no base version still just returns it, so a duplicate of an old create can never undo a delete.
  const restoring = !!existing?.deleted_at && existing.version === env.baseVersion;
  const refusal = !existing ? 'not-found' : restoring ? null : existing.deleted_at ? 'deleted' : existing.version !== env.baseVersion ? 'stale' : null;
  if (refusal) {
    await refuse(trx, userId, 'log-session', env, refusal, clientVersion);
    return { status: 409, body: { refused: refusal, current: existing } };
  }
  const next = await seq();
  const row = await trx
    .updateTable('log_entries')
    .set({ ...columns(input), ...(restoring ? { deleted_at: null } : {}), version: env.baseVersion + 1, seq: next, updated_at: sql`now()` })
    .where('id', '=', existing!.id)
    .returningAll()
    .executeTakeFirstOrThrow();
  const replaced = await replaceCheckOff(trx, userId, input, next);
  return { status: 200, body: { rows: [row, ...replaced], cursor: next } };
}
