import { sql, type Transaction } from 'kysely';
import { validateDeleteBodyWeight, validateLogBodyWeight } from '../../src/shared/commands.ts';
import type { DB } from '../db/types.ts';
import { lockUser, nextSeq, parseEnvelope, refuse, type BodyEntryRow } from './support.ts';

// ADR 003 and 008, backend-data-rules.md section 3 rule 4: one body-weight entry per week. The week is the key, so a
// create is "no live row for this week" rather than a client id. A deleted week keeps its row; logging it again revives
// that row (version + 1) instead of adding a second one.
// - Same values as the row already there: success, nothing changes (a retry, or the same weigh-in from two devices).
// - Otherwise a live row is edited only when baseVersion is the version the phone saw; anything else is 409 with the
//   current row (including a create for a week that already has a different weigh-in).
// - baseVersion names a row that is deleted: 409 with the tombstone (FM-05). baseVersion null on a deleted week revives.

export type BodyWeightResult =
  | { status: 200 | 201; body: { rows: BodyEntryRow[]; cursor: string } }
  | { status: 409 | 422; body: { refused: string; current: BodyEntryRow | null } };

const sameWeighIn = (row: BodyEntryRow, { d, w }: { d: string; w: number }) => row.d === d && Number(row.weight_lb) === w;

export async function logBodyWeight(trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null): Promise<BodyWeightResult> {
  const env = parseEnvelope(body);
  if (!env) {
    await refuse(trx, userId, 'log-body-weight', { input: body }, 'bad-envelope', clientVersion);
    return { status: 422, body: { refused: 'bad-envelope', current: null } };
  }
  const input = validateLogBodyWeight(env.input);
  if (!input) {
    await refuse(trx, userId, 'log-body-weight', env, 'invalid-input', clientVersion);
    return { status: 422, body: { refused: 'invalid-input', current: null } };
  }

  await lockUser(trx, userId);
  const existing = (await trx.selectFrom('body_entries').selectAll().where('user_id', '=', userId).where('wk', '=', input.wk).executeTakeFirst()) ?? null;
  const values = { d: input.d, weight_lb: input.w };

  if (!existing) {
    if (env.baseVersion !== null) {
      await refuse(trx, userId, 'log-body-weight', env, 'not-found', clientVersion);
      return { status: 409, body: { refused: 'not-found', current: null } };
    }
    const seq = await nextSeq(trx, userId);
    const row = await trx.insertInto('body_entries').values({ user_id: userId, seq, wk: input.wk, ...values }).returningAll().executeTakeFirstOrThrow();
    return { status: 201, body: { rows: [row], cursor: seq } };
  }

  if (existing.deleted_at) {
    if (env.baseVersion !== null) {
      await refuse(trx, userId, 'log-body-weight', env, 'deleted', clientVersion);
      return { status: 409, body: { refused: 'deleted', current: existing } };
    }
    const seq = await nextSeq(trx, userId);
    const row = await trx
      .updateTable('body_entries')
      .set({ ...values, deleted_at: null, version: existing.version + 1, seq, updated_at: sql`now()` })
      .where('id', '=', existing.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { status: 200, body: { rows: [row], cursor: seq } };
  }

  if (sameWeighIn(existing, { d: input.d, w: input.w })) return { status: 200, body: { rows: [existing], cursor: existing.seq } };
  if (existing.version !== env.baseVersion) {
    await refuse(trx, userId, 'log-body-weight', env, 'stale', clientVersion);
    return { status: 409, body: { refused: 'stale', current: existing } };
  }
  const seq = await nextSeq(trx, userId);
  const row = await trx
    .updateTable('body_entries')
    .set({ ...values, version: existing.version + 1, seq, updated_at: sql`now()` })
    .where('id', '=', existing.id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return { status: 200, body: { rows: [row], cursor: seq } };
}

export async function deleteBodyWeight(trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null): Promise<BodyWeightResult> {
  const env = parseEnvelope(body);
  if (!env) {
    await refuse(trx, userId, 'delete-body-weight', { input: body }, 'bad-envelope', clientVersion);
    return { status: 422, body: { refused: 'bad-envelope', current: null } };
  }
  const input = validateDeleteBodyWeight(env.input);
  if (!input || env.baseVersion === null) {
    await refuse(trx, userId, 'delete-body-weight', env, 'invalid-input', clientVersion);
    return { status: 422, body: { refused: 'invalid-input', current: null } };
  }

  await lockUser(trx, userId);
  const existing = (await trx.selectFrom('body_entries').selectAll().where('user_id', '=', userId).where('wk', '=', input.wk).executeTakeFirst()) ?? null;
  if (existing?.deleted_at) return { status: 200, body: { rows: [existing], cursor: existing.seq } };

  const refusal = !existing ? 'not-found' : existing.version !== env.baseVersion ? 'stale' : null;
  if (refusal) {
    await refuse(trx, userId, 'delete-body-weight', env, refusal, clientVersion);
    return { status: 409, body: { refused: refusal, current: existing } };
  }
  const seq = await nextSeq(trx, userId);
  const row = await trx
    .updateTable('body_entries')
    .set({ deleted_at: sql`now()`, version: env.baseVersion + 1, seq, updated_at: sql`now()` })
    .where('id', '=', existing!.id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return { status: 200, body: { rows: [row], cursor: seq } };
}
