import { isDeepStrictEqual } from 'node:util';
import { sql, type Transaction } from 'kysely';
import {
  validateDeleteProgram,
  validateDeleteWeek,
  validateSaveConfig,
  validateSaveProgram,
  validateSaveStretchWeek,
  validateSaveWeek,
} from '../../src/shared/commands.ts';
import type { DB } from '../db/types.ts';
import { lockUser, nextSeq, parseEnvelope, refuse, type ConfigRow, type ProgramRow, type StretchWeekRow, type WeekRow } from './support.ts';

// ADR 003 and 008, backend-data-rules.md section 4. A document row (a week, a stretch week, a program, the config) is
// read and written whole. It is keyed by a column (the week start, the program key) or by the user alone (the config), so
// a create is "no live row for this key". The rules are the ones body weight uses:
// - Same document as the row already there: success, nothing changes (a retry, or the same save from two devices).
// - Otherwise a live row is replaced only when baseVersion is the version the phone saw; anything else is 409 with the
//   current row, and the phone re-applies the section 4 merge rules and sends again (FM-04).
// - baseVersion names a row that is deleted: 409 with the tombstone (FM-05). baseVersion null on a deleted row revives it.
// Every document table shares this code; only the table, the key, the command names and the cleaner differ.

export type DocRow = WeekRow | StretchWeekRow | ProgramRow | ConfigRow;

export type DocResult =
  | { status: 200 | 201; body: { rows: DocRow[]; cursor: string } }
  | { status: 409 | 422; body: { refused: string; current: DocRow | null } };

type Table = 'weeks' | 'stretch_weeks' | 'programs' | 'config';
type KeyColumn = 'week_start' | 'key';

interface Kind {
  table: Table;
  // The column that names the row within a user; null when a user has exactly one row.
  keyColumn: KeyColumn | null;
  save: string;
  remove: string | null;
  // Null when the input is unusable; otherwise the row key (null for a keyless table) and the cleaned document.
  clean: (input: unknown) => { key: string | null; data: object } | null;
  // The key named by a delete command, or null when the input is unusable.
  cleanKey: (input: unknown) => string | null;
}

const WEEKS: Kind = {
  table: 'weeks',
  keyColumn: 'week_start',
  save: 'save-week',
  remove: 'delete-week',
  clean: input => {
    const out = validateSaveWeek(input);
    return out && { key: out.weekStart, data: out.week };
  },
  cleanKey: input => validateDeleteWeek(input)?.weekStart ?? null,
};
const STRETCH_WEEKS: Kind = {
  table: 'stretch_weeks',
  keyColumn: 'week_start',
  save: 'save-stretch-week',
  remove: 'delete-stretch-week',
  clean: input => {
    const out = validateSaveStretchWeek(input);
    return out && { key: out.weekStart, data: out.week };
  },
  cleanKey: input => validateDeleteWeek(input)?.weekStart ?? null,
};
const PROGRAMS: Kind = {
  table: 'programs',
  keyColumn: 'key',
  save: 'save-program',
  remove: 'delete-program',
  clean: input => {
    const out = validateSaveProgram(input);
    return out && { key: out.key, data: out.program };
  },
  cleanKey: input => validateDeleteProgram(input)?.key ?? null,
};
const CONFIG: Kind = {
  table: 'config',
  keyColumn: null,
  save: 'save-config',
  remove: null,
  clean: input => {
    const out = validateSaveConfig(input);
    return out && { key: null, data: out.config };
  },
  cleanKey: () => null,
};

// The tables have the same columns apart from the key, so the query builder is typed once against 'weeks'.
const rowFor = (trx: Transaction<DB>, kind: Kind, userId: string, key: string | null) => {
  let q = trx.selectFrom(kind.table as 'weeks').selectAll().where('user_id', '=', userId);
  if (kind.keyColumn) q = q.where(kind.keyColumn as 'week_start', '=', key!);
  return q.executeTakeFirst();
};

async function save(kind: Kind, trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null): Promise<DocResult> {
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
  const existing = ((await rowFor(trx, kind, userId, input.key)) as DocRow | undefined) ?? null;
  const data = JSON.stringify(input.data);
  const write = async (values: Record<string, unknown>) =>
    (await trx.updateTable(kind.table as 'weeks').set(values).where('id', '=', existing!.id).returningAll().executeTakeFirstOrThrow()) as DocRow;

  if (!existing) {
    if (env.baseVersion !== null) {
      await refuse(trx, userId, kind.save, env, 'not-found', clientVersion);
      return { status: 409, body: { refused: 'not-found', current: null } };
    }
    const seq = await nextSeq(trx, userId);
    const keyed = kind.keyColumn ? { [kind.keyColumn]: input.key } : {};
    const row = (await trx.insertInto(kind.table as 'weeks').values({ user_id: userId, seq, data, ...keyed } as never).returningAll().executeTakeFirstOrThrow()) as DocRow;
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

async function remove(kind: Kind, command: string, trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null): Promise<DocResult> {
  const env = parseEnvelope(body);
  if (!env) {
    await refuse(trx, userId, command, { input: body }, 'bad-envelope', clientVersion);
    return { status: 422, body: { refused: 'bad-envelope', current: null } };
  }
  const key = kind.cleanKey(env.input);
  if (key === null || env.baseVersion === null) {
    await refuse(trx, userId, command, env, 'invalid-input', clientVersion);
    return { status: 422, body: { refused: 'invalid-input', current: null } };
  }

  await lockUser(trx, userId);
  const existing = ((await rowFor(trx, kind, userId, key)) as DocRow | undefined) ?? null;
  if (existing?.deleted_at) return { status: 200, body: { rows: [existing], cursor: existing.seq } };

  const refusal = !existing ? 'not-found' : existing.version !== env.baseVersion ? 'stale' : null;
  if (refusal) {
    await refuse(trx, userId, command, env, refusal, clientVersion);
    return { status: 409, body: { refused: refusal, current: existing } };
  }
  const seq = await nextSeq(trx, userId);
  const row = (await trx
    .updateTable(kind.table as 'weeks')
    .set({ deleted_at: sql`now()`, version: env.baseVersion + 1, seq, updated_at: sql`now()` })
    .where('id', '=', existing!.id)
    .returningAll()
    .executeTakeFirstOrThrow()) as DocRow;
  return { status: 200, body: { rows: [row], cursor: seq } };
}

type Handler = (trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null) => Promise<DocResult>;
const saving = (kind: Kind): Handler => (trx, userId, body, clientVersion) => save(kind, trx, userId, body, clientVersion);
const removing = (kind: Kind): Handler => (trx, userId, body, clientVersion) => remove(kind, kind.remove!, trx, userId, body, clientVersion);

export const saveWeek = saving(WEEKS);
export const deleteWeek = removing(WEEKS);
export const saveStretchWeek = saving(STRETCH_WEEKS);
export const deleteStretchWeek = removing(STRETCH_WEEKS);
export const saveProgram = saving(PROGRAMS);
export const deleteProgram = removing(PROGRAMS);
export const saveConfig = saving(CONFIG);
