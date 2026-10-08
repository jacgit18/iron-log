import { isDeepStrictEqual } from 'node:util';
import { sql, type Transaction } from 'kysely';
import {
  validateDeleteLibraryItem,
  validateDeleteListItem,
  validateDeleteProgram,
  validateDeleteWeek,
  validateSaveConfig,
  validateSaveLibraryItem,
  validateSaveListItem,
  validateSaveProgram,
  validateSaveStretchWeek,
  validateSaveWeek,
} from '../../src/shared/commands.ts';
import type { DB } from '../db/types.ts';
import { lockUser, nextSeq, parseEnvelope, refuse, type ConfigRow, type LibraryItemRow, type ListItemRow, type ProgramRow, type StretchWeekRow, type WeekRow } from './support.ts';

// ADR 003 and 008, backend-data-rules.md section 4. A document row (a week, a stretch week, a program, the config) is
// read and written whole. It is keyed by one or more columns (the week start, the program key) or by the user alone (the config), so
// a create is "no live row for this key". The rules are the ones body weight uses:
// - Same document as the row already there: success, nothing changes (a retry, or the same save from two devices).
// - Otherwise a live row is replaced only when baseVersion is the version the phone saw; anything else is 409 with the
//   current row, and the phone re-applies the section 4 merge rules and sends again (FM-04).
// - baseVersion names a row that is deleted: 409 with the tombstone (FM-05). baseVersion null on a deleted row revives it.
// Every document table shares this code; only the table, the key, the command names and the cleaner differ.

export type DocRow = WeekRow | StretchWeekRow | ProgramRow | ConfigRow | LibraryItemRow | ListItemRow;

export type DocResult =
  | { status: 200 | 201; body: { rows: DocRow[]; cursor: string } }
  | { status: 409 | 422; body: { refused: string; current: DocRow | null } };

type Table = 'weeks' | 'stretch_weeks' | 'programs' | 'config' | 'library_items' | 'list_items';

interface Kind {
  table: Table;
  // The columns that name the row within a user, in order; empty when a user has exactly one row.
  keyColumns: readonly string[];
  save: string;
  remove: string | null;
  // Null when the input is unusable; otherwise the row key (one value per key column), the cleaned document and any
  // other columns the save sets (they count as part of the document when deciding whether a save changes anything).
  clean: (input: unknown) => { keys: string[]; data: object; extra?: Record<string, unknown> } | null;
  // The key named by a delete command, or null when the input is unusable.
  cleanKey: (input: unknown) => string[] | null;
}

const WEEKS: Kind = {
  table: 'weeks',
  keyColumns: ['week_start'],
  save: 'save-week',
  remove: 'delete-week',
  clean: input => {
    const out = validateSaveWeek(input);
    return out && { keys: [out.weekStart], data: out.week };
  },
  cleanKey: input => {
    const out = validateDeleteWeek(input);
    return out && [out.weekStart];
  },
};
const STRETCH_WEEKS: Kind = {
  table: 'stretch_weeks',
  keyColumns: ['week_start'],
  save: 'save-stretch-week',
  remove: 'delete-stretch-week',
  clean: input => {
    const out = validateSaveStretchWeek(input);
    return out && { keys: [out.weekStart], data: out.week };
  },
  cleanKey: input => {
    const out = validateDeleteWeek(input);
    return out && [out.weekStart];
  },
};
const PROGRAMS: Kind = {
  table: 'programs',
  keyColumns: ['key'],
  save: 'save-program',
  remove: 'delete-program',
  clean: input => {
    const out = validateSaveProgram(input);
    return out && { keys: [out.key], data: out.program };
  },
  cleanKey: input => {
    const out = validateDeleteProgram(input);
    return out && [out.key];
  },
};
const CONFIG: Kind = {
  table: 'config',
  keyColumns: [],
  save: 'save-config',
  remove: null,
  clean: input => {
    const out = validateSaveConfig(input);
    return out && { keys: [], data: out.config };
  },
  cleanKey: () => null,
};

const LIBRARY_ITEMS: Kind = {
  table: 'library_items',
  keyColumns: ['client_id'],
  save: 'save-library-item',
  remove: 'delete-library-item',
  clean: input => {
    const out = validateSaveLibraryItem(input);
    return out && { keys: [out.item.id], data: out.item };
  },
  cleanKey: input => {
    const out = validateDeleteLibraryItem(input);
    return out && [out.id];
  },
};

const LIST_ITEMS: Kind = {
  table: 'list_items',
  keyColumns: ['list', 'client_id'],
  save: 'save-list-item',
  remove: 'delete-list-item',
  clean: input => {
    const out = validateSaveListItem(input);
    return out && { keys: [out.list, out.item.id], data: out.item, extra: { position: out.position } };
  },
  cleanKey: input => {
    const out = validateDeleteListItem(input);
    return out && [out.list, out.id];
  },
};

// The tables have the same columns apart from the key, so the query builder is typed once against 'weeks'.
const rowFor = (trx: Transaction<DB>, kind: Kind, userId: string, keys: string[]) => {
  let q = trx.selectFrom(kind.table as 'weeks').selectAll().where('user_id', '=', userId);
  kind.keyColumns.forEach((column, i) => {
    q = q.where(column as 'week_start', '=', keys[i]!);
  });
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
  const existing = ((await rowFor(trx, kind, userId, input.keys)) as DocRow | undefined) ?? null;
  const data = JSON.stringify(input.data);
  const extra = input.extra ?? {};
  const write = async (values: Record<string, unknown>) =>
    (await trx.updateTable(kind.table as 'weeks').set({ ...values, ...extra }).where('id', '=', existing!.id).returningAll().executeTakeFirstOrThrow()) as DocRow;

  if (!existing) {
    if (env.baseVersion !== null) {
      await refuse(trx, userId, kind.save, env, 'not-found', clientVersion);
      return { status: 409, body: { refused: 'not-found', current: null } };
    }
    const seq = await nextSeq(trx, userId);
    const keyed = Object.fromEntries(kind.keyColumns.map((column, i) => [column, input.keys[i]]));
    const row = (await trx.insertInto(kind.table as 'weeks').values({ user_id: userId, seq, data, ...keyed, ...extra } as never).returningAll().executeTakeFirstOrThrow()) as DocRow;
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

  const row = existing as Record<string, unknown>;
  if (isDeepStrictEqual(existing.data, JSON.parse(data)) && Object.entries(extra).every(([column, value]) => row[column] === value)) return { status: 200, body: { rows: [existing], cursor: existing.seq } };
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
  const keys = kind.cleanKey(env.input);
  if (keys === null || env.baseVersion === null) {
    await refuse(trx, userId, command, env, 'invalid-input', clientVersion);
    return { status: 422, body: { refused: 'invalid-input', current: null } };
  }

  await lockUser(trx, userId);
  const existing = ((await rowFor(trx, kind, userId, keys)) as DocRow | undefined) ?? null;
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
export const saveLibraryItem = saving(LIBRARY_ITEMS);
export const deleteLibraryItem = removing(LIBRARY_ITEMS);
export const saveListItem = saving(LIST_ITEMS);
export const deleteListItem = removing(LIST_ITEMS);
