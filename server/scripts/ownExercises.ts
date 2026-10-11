import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/types.ts';
import { lockUser, nextSeq } from '../commands/support.ts';
import { adminId } from './resetAccounts.ts';

// One-off (2026-10-11, ADR 024): synced, an account's Exercise library is only the exercises saved in its config `ex`, so a new account
// starts with an empty library. The built-in exercises in app code are the admin's own, and the admin's library listed them from code.
// Here each one is written into the admin's config `ex` as a full entry of theirs, so the library keeps every exercise and marks each
// Yours. What the admin already set on an exercise (name, video link, equipment, a cleared value) wins over the built-in value. Run by
// hand, never from an API route; only the admin's config row changes. Without `apply` nothing is written; the result says what would be.
// The built-in list is app code (src/lib), which server/ may not import (ADR 015), so the caller passes it in: scripts/own-exercises.mjs.

export interface OwnExercisesOptions {
  /** The admin's email (as on ADMIN_EMAILS) or auth_user_id. */
  admin: string;
  apply: boolean;
  /** The built-in exercises, id → { n, url?, eq? }. */
  builtins: Record<string, object>;
}

export interface OwnExercisesResult {
  applied: boolean;
  userId: string;
  /** Built-in ids written (or completed) in the admin's config `ex`. */
  written: string[];
}

const isObj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o);

export async function ownExercises(db: Kysely<DB>, { admin, apply, builtins }: OwnExercisesOptions): Promise<OwnExercisesResult> {
  return db.transaction().execute(async trx => {
    const userId = await adminId(trx, admin);
    await lockUser(trx, userId);
    const row = await trx.selectFrom('config').selectAll().where('user_id', '=', userId).executeTakeFirst();
    const data: Record<string, unknown> = row && !row.deleted_at && isObj(row.data) ? row.data : {};
    const ex: Record<string, unknown> = isObj(data.ex) ? { ...data.ex } : {};
    const written: string[] = [];
    for (const [id, base] of Object.entries(builtins)) {
      const mine = isObj(ex[id]) ? ex[id] : {};
      if (Object.keys(base).every(k => k in mine)) continue; // already a full entry (jsonb keeps no key order, so compare by key)
      ex[id] = { ...base, ...mine };
      written.push(id);
    }
    if (apply && written.length) {
      const seq = await nextSeq(trx, userId);
      const json = { ...data, ex } as never;
      if (row) await trx.updateTable('config').set({ data: json, deleted_at: null, version: row.version + 1, seq, updated_at: sql`now()` }).where('id', '=', row.id).execute();
      else await trx.insertInto('config').values({ user_id: userId, data: json, seq }).execute();
    }
    return { applied: apply, userId, written };
  });
}
