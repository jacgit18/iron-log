import { isDeepStrictEqual } from 'node:util';
import { sql, type Transaction } from 'kysely';
import { validateDeleteWeek, validateSaveStretchWeek, validateSaveWeek } from '../../src/shared/commands.ts';
import type { DB } from '../db/types.ts';
import { lockUser, nextSeq, parseEnvelope, refuse, type WeekRow } from './support.ts';

// ADR 003 and 008, backend-data-rules.md section 4. A week is one document per user and week, read and written whole.
// The week start is the key, so a create is "no live row for this week". The rules are the ones body weight uses:
// - Same document as the row already there: success, nothing changes (a retry, or the same save from two devices).
// - Otherwise a live row is replaced only when baseVersion is the version the phone saw; anything else is 409 with the
//   current row, and the phone re-applies the section 4 merge rules and sends again (FM-04).
// - baseVersion names a row that is deleted: 409 with the tombstone (FM-05). baseVersion null on a deleted week revives it.
// Weeks and stretch weeks share this code; only the table, the command name and the document cleaner differ.

export type WeekDocResult<R> =
  | { status: 200 | 201; body: { rows: R[]; cursor: string } }
  | { status: 409 | 422; body: { refused: string; current: R | null } };

type Table = 'weeks' | 'stretch_weeks';
interface Kind {
  table: Table;
  save: string;
  remove: string;
  // Null when the input is unusable; otherwise the week start and the cleaned document.
  clean: (input: unknown) => { weekStart: string; data: object } | null;
}

const WEEKS: Kind = {
  table: 'weeks',
  save: 'save-week',
  remove: 'delete-week',
  clean: input => {
    const out = validateSaveWeek(input);
    return out && { weekStart: out.weekStart, data: out.week };
  },
};
const STRETCH_WEEKS: Kind = {
  table: 'stretch_weeks',
  save: 'save-stretch-week',
  remove: 'delete-stretch-week',
  clean: input => {
    const out = validateSaveStretchWeek(input);
    return out && { weekStart: out.weekStart, data: out.week };
  },
};

// The two tables have the same columns, so the query builder is typed once against 'weeks'.
const rowFor = (trx: Transaction<DB>, kind: Kind, userId: string, weekStart: string) =>
  trx.selectFrom(kind.table as 'weeks').selectAll().where('user_id', '=', userId).where('week_start', '=', weekStart).executeTakeFirst();

async function save<R extends WeekRow>(kind: Kind, trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null): Promise<WeekDocResult<R>> {
  const env = parseEnvelope(body);
  if (!env) {
    await refuse(trx, userId, kind.save, { input: body }, 'bad-envelope', clientVersion);
    return { status: 422, body: { refused: 'bad-envelope', current: null } };
  }
  const input = kind.clean(env.input);
  if (!input) {
    await refuse(trx, userId, kind.save, env, 'invalid-input', clientVersion);
    return { status: 422, body: { refused: 'invalid-input', current: null } };
  }

  await lockUser(trx, userId);
  const existing = ((await rowFor(trx, kind, userId, input.weekStart)) as R | undefined) ?? null;
  const data = JSON.stringify(input.data);
  const write = async (values: Record<string, unknown>) =>
    (await trx.updateTable(kind.table as 'weeks').set(values).where('id', '=', existing!.id).returningAll().executeTakeFirstOrThrow()) as R;

  if (!existing) {
    if (env.baseVersion !== null) {
      await refuse(trx, userId, kind.save, env, 'not-found', clientVersion);
      return { status: 409, body: { refused: 'not-found', current: null } };
    }
    const seq = await nextSeq(trx, userId);
    const row = (await trx.insertInto(kind.table as 'weeks').values({ user_id: userId, seq, week_start: input.weekStart, data }).returningAll().executeTakeFirstOrThrow()) as R;
    return { status: 201, body: { rows: [row], cursor: seq } };
  }

  if (existing.deleted_at) {
    if (env.baseVersion !== null) {
      await refuse(trx, userId, kind.save, env, 'deleted', clientVersion);
      return { status: 409, body: { refused: 'deleted', current: existing } };
    }
    const seq = await nextSeq(trx, userId);
    return { status: 200, body: { rows: [await write({ data, deleted_at: null, version: existing.version + 1, seq, updated_at: sql`now()` })], cursor: seq } };
  }

  if (isDeepStrictEqual(existing.data, JSON.parse(data))) return { status: 200, body: { rows: [existing], cursor: existing.seq } };
  if (existing.version !== env.baseVersion) {
    await refuse(trx, userId, kind.save, env, 'stale', clientVersion);
    return { status: 409, body: { refused: 'stale', current: existing } };
  }
  const seq = await nextSeq(trx, userId);
  return { status: 200, body: { rows: [await write({ data, version: existing.version + 1, seq, updated_at: sql`now()` })], cursor: seq } };
}

async function remove<R extends WeekRow>(kind: Kind, trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null): Promise<WeekDocResult<R>> {
  const env = parseEnvelope(body);
  if (!env) {
    await refuse(trx, userId, kind.remove, { input: body }, 'bad-envelope', clientVersion);
    return { status: 422, body: { refused: 'bad-envelope', current: null } };
  }
  const input = validateDeleteWeek(env.input);
  if (!input || env.baseVersion === null) {
    await refuse(trx, userId, kind.remove, env, 'invalid-input', clientVersion);
    return { status: 422, body: { refused: 'invalid-input', current: null } };
  }

  await lockUser(trx, userId);
  const existing = ((await rowFor(trx, kind, userId, input.weekStart)) as R | undefined) ?? null;
  if (existing?.deleted_at) return { status: 200, body: { rows: [existing], cursor: existing.seq } };

  const refusal = !existing ? 'not-found' : existing.version !== env.baseVersion ? 'stale' : null;
  if (refusal) {
    await refuse(trx, userId, kind.remove, env, refusal, clientVersion);
    return { status: 409, body: { refused: refusal, current: existing } };
  }
  const seq = await nextSeq(trx, userId);
  const row = (await trx
    .updateTable(kind.table as 'weeks')
    .set({ deleted_at: sql`now()`, version: env.baseVersion + 1, seq, updated_at: sql`now()` })
    .where('id', '=', existing!.id)
    .returningAll()
    .executeTakeFirstOrThrow()) as R;
  return { status: 200, body: { rows: [row], cursor: seq } };
}

export const saveWeek = (trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null) => save(WEEKS, trx, userId, body, clientVersion);
export const deleteWeek = (trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null) => remove(WEEKS, trx, userId, body, clientVersion);
export const saveStretchWeek = (trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null) => save(STRETCH_WEEKS, trx, userId, body, clientVersion);
export const deleteStretchWeek = (trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null) => remove(STRETCH_WEEKS, trx, userId, body, clientVersion);
