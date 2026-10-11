import { sql, type Kysely, type Transaction } from 'kysely';
import type { DB } from '../db/types.ts';
import { lockUser, nextSeq } from '../commands/support.ts';
import { normStretchItem } from '../../src/shared/listItems.ts';

// One-off reset (2026-10-11, ADR 021): every account starts with no program and empty libraries, and builds its own. Run by hand,
// never from an API route. Two parts, in one transaction:
//
//   Admin (kept): the app used to show the owner's built-in plan for a synced program with no saved row, when the account had log
//   entries, and the default stretch routine for a stretch list with no rows. The app no longer does (ADR 021), so the admin's
//   board would lose what it shows. Here what the admin sees is written down as real rows first: a built-in A/B that has no live
//   row, and the default stretches when the account has no stretch rows at all. Rows the admin saved are never touched.
//
//   Everyone else: their programs A/B, the Program library (library_items), the stretch list (list 'stretch') and what they set
//   on exercises in the Exercise library (config `ex` and `muscleMap`, plus `progNames` and `phDef`, which belong to the programs)
//   are deleted. Deletes are the normal soft delete (deleted_at, version + 1, a new seq), so phones pull them like a delete made on
//   another phone. Log entries, weeks, body weights, stretch weeks, supplements, experiments and other settings stay.
//
// Without `apply` nothing is written; the result says what would be. The built-in plan and the default stretches are app code (src/lib),
// which server/ may not import (ADR 015), so the caller passes them in: scripts/reset-accounts.mjs.

export const CLEARED_CONFIG_KEYS = ['ex', 'muscleMap', 'progNames', 'phDef'] as const;

export interface ResetOptions {
  /** The admin's email (as on ADMIN_EMAILS) or auth_user_id. Their data is kept. */
  admin: string;
  apply: boolean;
  /** What the app showed from code: the built-in programs A and B, and the default stretch routine. */
  defaults: { programs: Record<'A' | 'B', object>; stretches: readonly unknown[] };
}

export interface ResetResult {
  applied: boolean;
  admin: { userId: string; programsWritten: string[]; stretchesWritten: number };
  others: { accounts: number; programs: number; libraryItems: number; stretches: number; configs: number };
}

async function adminId(trx: Transaction<DB>, admin: string): Promise<string> {
  const rows = (await sql<{ id: string; is_admin: boolean }>`
    select u.id::text as id, u.is_admin from users u left join auth."user" a on a.id = u.auth_user_id
    where u.auth_user_id = ${admin} or lower(a.email) = lower(${admin})`.execute(trx)).rows;
  if (rows.length !== 1) throw new Error(rows.length ? `"${admin}" matches more than one account` : `no account for "${admin}"`);
  // A typo here would keep the wrong account and clear the admin's, so the account kept must be marked admin in the database.
  if (!rows[0]!.is_admin) throw new Error(`"${admin}" is not marked is_admin, so nothing was changed`);
  return rows[0]!.id;
}

const hasRows = async (trx: Transaction<DB>, table: 'log_entries' | 'stretch_weeks', userId: string) =>
  !!(await trx.selectFrom(table).select('id').where('user_id', '=', userId).where('deleted_at', 'is', null).limit(1).executeTakeFirst());

// What the app showed the admin from code, saved as rows (the old ADR 016 rule: built-in plan and default stretches once there is history).
async function keepAdmin(trx: Transaction<DB>, userId: string, apply: boolean, defaults: ResetOptions['defaults']) {
  await lockUser(trx, userId);
  const entries = await hasRows(trx, 'log_entries', userId);
  const programsWritten: string[] = [];
  if (entries) {
    for (const key of ['A', 'B'] as const) {
      const row = await trx.selectFrom('programs').selectAll().where('user_id', '=', userId).where('key', '=', key).executeTakeFirst();
      if (row && !row.deleted_at) continue;
      programsWritten.push(key);
      if (!apply) continue;
      const seq = await nextSeq(trx, userId);
      const data = structuredClone(defaults.programs[key]) as never;
      if (row) await trx.updateTable('programs').set({ data, deleted_at: null, version: row.version + 1, seq, updated_at: sql`now()` }).where('id', '=', row.id).execute();
      else await trx.insertInto('programs').values({ user_id: userId, key, data, seq }).execute();
    }
  }
  let stretchesWritten = 0;
  const anyStretchRow = await trx.selectFrom('list_items').select('id').where('user_id', '=', userId).where('list', 'in', ['stretch', 'stretch_experiment']).limit(1).executeTakeFirst();
  if (!anyStretchRow && (entries || await hasRows(trx, 'stretch_weeks', userId))) {
    const items = defaults.stretches.map(s => normStretchItem(structuredClone(s))).filter(s => s !== null);
    stretchesWritten = items.length;
    if (apply) {
      for (const [position, item] of items.entries()) {
        const seq = await nextSeq(trx, userId);
        await trx.insertInto('list_items').values({ user_id: userId, list: 'stretch', client_id: item.id, position, data: item as never, seq }).execute();
      }
    }
  }
  return { userId, programsWritten, stretchesWritten };
}

async function softDelete(trx: Transaction<DB>, table: 'programs' | 'library_items' | 'list_items', userId: string, apply: boolean, list?: string) {
  let q = trx.selectFrom(table).select(['id', 'version']).where('user_id', '=', userId).where('deleted_at', 'is', null);
  if (list) q = q.where(sql.ref('list'), '=', list);
  const rows = await q.execute();
  if (apply) {
    for (const r of rows) {
      const seq = await nextSeq(trx, userId);
      await trx.updateTable(table).set({ deleted_at: sql`now()`, version: r.version + 1, seq, updated_at: sql`now()` }).where('id', '=', r.id).execute();
    }
  }
  return rows.length;
}

async function clearConfig(trx: Transaction<DB>, userId: string, apply: boolean) {
  const row = await trx.selectFrom('config').selectAll().where('user_id', '=', userId).where('deleted_at', 'is', null).executeTakeFirst();
  const data = (row?.data ?? {}) as Record<string, unknown>;
  if (!row || !CLEARED_CONFIG_KEYS.some(k => k in data)) return 0;
  if (apply) {
    const next = Object.fromEntries(Object.entries(data).filter(([k]) => !(CLEARED_CONFIG_KEYS as readonly string[]).includes(k)));
    const seq = await nextSeq(trx, userId);
    await trx.updateTable('config').set({ data: next as never, version: row.version + 1, seq, updated_at: sql`now()` }).where('id', '=', row.id).execute();
  }
  return 1;
}

export async function resetAccounts(db: Kysely<DB>, { admin, apply, defaults }: ResetOptions): Promise<ResetResult> {
  return db.transaction().execute(async trx => {
    const keepId = await adminId(trx, admin);
    const kept = await keepAdmin(trx, keepId, apply, defaults);
    const others = { accounts: 0, programs: 0, libraryItems: 0, stretches: 0, configs: 0 };
    const users = await trx.selectFrom('users').select('id').where('id', '!=', keepId).orderBy('id').execute();
    for (const { id } of users) {
      if (apply) await lockUser(trx, id);
      others.accounts++;
      others.programs += await softDelete(trx, 'programs', id, apply);
      others.libraryItems += await softDelete(trx, 'library_items', id, apply);
      others.stretches += await softDelete(trx, 'list_items', id, apply, 'stretch');
      others.configs += await clearConfig(trx, id, apply);
    }
    return { applied: apply, admin: kept, others };
  });
}
