import type { Transaction } from 'kysely';
import { validateTickCard, type TickCardInput } from '../../src/shared/commands.ts';
import type { DB } from '../db/types.ts';
import { lockUser, nextSeq, parseEnvelope, refuse, type LogEntryRow } from './support.ts';

// ADR 008 and backend-data-rules.md section 3, rule 1: one check-off per card and week. A tick is always a create. It is
// a no-op that returns the row already there when this clientId was seen before (a retry) or when anything is already
// logged for the same exercise, card and week (the board does the same), so a queued tick is never quarantined for
// something that is already true.

export type TickCardResult =
  | { status: 200 | 201; body: { rows: LogEntryRow[]; cursor: string } }
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
  if (!input || env.baseVersion !== null) {
    await refuse(trx, userId, 'tick-card', env, 'invalid-input', clientVersion);
    return { status: 422, body: { refused: 'invalid-input', current: null } };
  }

  await lockUser(trx, userId);
  const retry = await trx.selectFrom('log_entries').selectAll().where('user_id', '=', userId).where('client_id', '=', env.clientId).executeTakeFirst();
  if (retry) return { status: 200, body: { rows: [retry], cursor: retry.seq } };

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
  const row = await trx.insertInto('log_entries').values({ user_id: userId, client_id: env.clientId, seq, ...columns(input) }).returningAll().executeTakeFirstOrThrow();
  return { status: 201, body: { rows: [row], cursor: seq } };
}
