import { sql, type Transaction } from 'kysely';
import { validateTickCard, type TickCardInput } from '../../src/shared/commands.ts';
import type { DB } from '../db/types.ts';
import { lockUser, nextSeq, parseEnvelope, refuse, type LogEntryRow } from './support.ts';

// ADR 008 and backend-data-rules.md section 3, rule 1: one check-off per card and week. A tick is a create (baseVersion
// null). It is a no-op that returns the row already there when this clientId was seen before (a retry) or when anything
// is already logged for the same exercise, card and week (the board does the same), so a queued tick is never quarantined
// for something that is already true.
// A tick can also be a restore: the board's Undo puts back a check-off that was unticked. The phone then names the
// tombstone's own version, meaning it saw the deletion and chose to bring the check-off back. A create with no base
// version never revives anything, so a duplicate of an old tick cannot undo an untick. If the card already has another
// check-off or a logged session by then, the restore is a no-op that returns it.

export type TickCardResult =
  | { status: 200 | 201; body: { rows: LogEntryRow[]; cursor: string } }
  | { status: 409; body: { refused: string; current: LogEntryRow | null } }
  | { status: 422; body: { refused: string; current: null } };

function columns({ exerciseId, entry }: TickCardInput) {
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
    slot: entry.slot!,
    wk: entry.wk!,
    auto: true,
    client_updated_at: entry.updatedAt ?? null,
  };
}

export async function tickCard(trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null): Promise<TickCardResult> {
  const env = parseEnvelope(body);
  if (!env) {
    await refuse(trx, userId, 'tick-card', { input: body }, 'bad-envelope', clientVersion);
    return { status: 422, body: { refused: 'bad-envelope', current: null } };
  }
  const input = validateTickCard(env.input);
  if (!input) {
    await refuse(trx, userId, 'tick-card', env, 'invalid-input', clientVersion);
    return { status: 422, body: { refused: 'invalid-input', current: null } };
  }

  await lockUser(trx, userId);
  const retry = await trx.selectFrom('log_entries').selectAll().where('user_id', '=', userId).where('client_id', '=', env.clientId).executeTakeFirst();
  const restoring = env.baseVersion !== null;
  if (restoring) {
    if (!retry) {
      await refuse(trx, userId, 'tick-card', env, 'not-found', clientVersion);
      return { status: 409, body: { refused: 'not-found', current: null } };
    }
    if (!retry.deleted_at) return { status: 200, body: { rows: [retry], cursor: retry.seq } };
    if (retry.version !== env.baseVersion) {
      await refuse(trx, userId, 'tick-card', env, 'deleted', clientVersion);
      return { status: 409, body: { refused: 'deleted', current: retry } };
    }
  } else if (retry) return { status: 200, body: { rows: [retry], cursor: retry.seq } };

  const there = await trx
    .selectFrom('log_entries')
    .selectAll()
    .where('user_id', '=', userId)
    .where('exercise_id', '=', input.exerciseId)
    .where('slot', '=', input.entry.slot!)
    .where('wk', '=', input.entry.wk!)
    .where('deleted_at', 'is', null)
    .orderBy('id')
    .executeTakeFirst();
  if (there) return { status: 200, body: { rows: [there], cursor: there.seq } };

  const seq = await nextSeq(trx, userId);
  if (restoring) {
    const row = await trx
      .updateTable('log_entries')
      .set({ ...columns(input), deleted_at: null, version: env.baseVersion! + 1, seq, updated_at: sql`now()` })
      .where('id', '=', retry!.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { status: 200, body: { rows: [row], cursor: seq } };
  }
  const row = await trx.insertInto('log_entries').values({ user_id: userId, client_id: env.clientId, seq, ...columns(input) }).returningAll().executeTakeFirstOrThrow();
  return { status: 201, body: { rows: [row], cursor: seq } };
}
