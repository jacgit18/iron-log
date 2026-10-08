import { isDeepStrictEqual } from 'node:util';
import { sql, type Transaction } from 'kysely';
import { validateDeleteSupplementDay, validateSaveSupplementDay } from '../../src/shared/commands.ts';
import type { DB } from '../db/types.ts';
import { lockUser, nextSeq, parseEnvelope, refuse, type SupplementDayRow } from './support.ts';

// ADR 003 and 008. One record per user and day (water drinks, boost, supplements ticked off), saved whole. Same rules as
// body weight and the week documents:
// - Same record as the row already there: success, nothing changes (a retry, or the same save from two devices).
// - Otherwise a live row is replaced only when baseVersion is the version the phone saw; anything else is 409 with the
//   current row, and the phone re-applies the merge rules and sends again. The merge keeps the day the device already
//   has (backend-data-rules.md section 4), so a refusal here is rare and recoverable.
// - baseVersion names a row that is deleted: 409 with the tombstone (FM-05). baseVersion null on a deleted day revives it.

export type SupplementDayResult =
  | { status: 200 | 201; body: { rows: SupplementDayRow[]; cursor: string } }
  | { status: 409 | 422; body: { refused: string; current: SupplementDayRow | null } };

const dayOf = (day: string, trx: Transaction<DB>, userId: string) => trx.selectFrom('supplement_days').selectAll().where('user_id', '=', userId).where('day', '=', day).executeTakeFirst();

const sameRecord = (row: SupplementDayRow, v: { water: number[]; boost: object | null; taken: object }) =>
  isDeepStrictEqual(row.water, v.water) && isDeepStrictEqual(row.boost, v.boost) && isDeepStrictEqual(row.taken, v.taken);

export async function saveSupplementDay(trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null): Promise<SupplementDayResult> {
  const env = parseEnvelope(body);
  if (!env) {
    await refuse(trx, userId, 'save-supplement-day', { input: body }, 'bad-envelope', clientVersion);
    return { status: 422, body: { refused: 'bad-envelope', current: null } };
  }
  const input = validateSaveSupplementDay(env.input);
  if (!input) {
    await refuse(trx, userId, 'save-supplement-day', env, 'invalid-input', clientVersion);
    return { status: 422, body: { refused: 'invalid-input', current: null } };
  }

  await lockUser(trx, userId);
  const existing = (await dayOf(input.day, trx, userId)) ?? null;
  const values = { water: JSON.stringify(input.water), boost: input.boost ? JSON.stringify(input.boost) : null, taken: JSON.stringify(input.taken) };
  const write = async (extra: Record<string, unknown>) =>
    trx.updateTable('supplement_days').set({ ...values, ...extra }).where('id', '=', existing!.id).returningAll().executeTakeFirstOrThrow();

  if (!existing) {
    if (env.baseVersion !== null) {
      await refuse(trx, userId, 'save-supplement-day', env, 'not-found', clientVersion);
      return { status: 409, body: { refused: 'not-found', current: null } };
    }
    const seq = await nextSeq(trx, userId);
    const row = await trx.insertInto('supplement_days').values({ user_id: userId, seq, day: input.day, ...values }).returningAll().executeTakeFirstOrThrow();
    return { status: 201, body: { rows: [row], cursor: seq } };
  }

  if (existing.deleted_at) {
    if (env.baseVersion !== null) {
      await refuse(trx, userId, 'save-supplement-day', env, 'deleted', clientVersion);
      return { status: 409, body: { refused: 'deleted', current: existing } };
    }
    const seq = await nextSeq(trx, userId);
    return { status: 200, body: { rows: [await write({ deleted_at: null, version: existing.version + 1, seq, updated_at: sql`now()` })], cursor: seq } };
  }

  if (sameRecord(existing, input)) return { status: 200, body: { rows: [existing], cursor: existing.seq } };
  if (existing.version !== env.baseVersion) {
    await refuse(trx, userId, 'save-supplement-day', env, 'stale', clientVersion);
    return { status: 409, body: { refused: 'stale', current: existing } };
  }
  const seq = await nextSeq(trx, userId);
  return { status: 200, body: { rows: [await write({ version: existing.version + 1, seq, updated_at: sql`now()` })], cursor: seq } };
}

export async function deleteSupplementDay(trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null): Promise<SupplementDayResult> {
  const env = parseEnvelope(body);
  if (!env) {
    await refuse(trx, userId, 'delete-supplement-day', { input: body }, 'bad-envelope', clientVersion);
    return { status: 422, body: { refused: 'bad-envelope', current: null } };
  }
  const input = validateDeleteSupplementDay(env.input);
  if (!input || env.baseVersion === null) {
    await refuse(trx, userId, 'delete-supplement-day', env, 'invalid-input', clientVersion);
    return { status: 422, body: { refused: 'invalid-input', current: null } };
  }

  await lockUser(trx, userId);
  const existing = (await dayOf(input.day, trx, userId)) ?? null;
  if (existing?.deleted_at) return { status: 200, body: { rows: [existing], cursor: existing.seq } };

  const refusal = !existing ? 'not-found' : existing.version !== env.baseVersion ? 'stale' : null;
  if (refusal) {
    await refuse(trx, userId, 'delete-supplement-day', env, refusal, clientVersion);
    return { status: 409, body: { refused: refusal, current: existing } };
  }
  const seq = await nextSeq(trx, userId);
  const row = await trx
    .updateTable('supplement_days')
    .set({ deleted_at: sql`now()`, version: env.baseVersion + 1, seq, updated_at: sql`now()` })
    .where('id', '=', existing!.id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return { status: 200, body: { rows: [row], cursor: seq } };
}
