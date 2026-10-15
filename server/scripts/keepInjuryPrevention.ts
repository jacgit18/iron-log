import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/types.ts';
import { lockUser, nextSeq } from '../commands/support.ts';

// One-off (2026-10-14): Injury prevention was on unless an account turned it off (config `injuryPrevention: false`). It is now off unless
// turned on (`injuryPrevention: true`), so a new account starts with it off. Run by hand, after a backup and before deploying that change:
// every account that has not chosen gets `injuryPrevention: true` written into its config, so what it sees does not change. An account
// that turned it off (false) or on (true) is left alone. An account with no config row, or an erased one, gets a row with only that key.
// Each write is a normal config write (version + 1, a new seq), so phones pull it. Without `apply` nothing is written.

export interface KeepResult {
  applied: boolean;
  /** Accounts given `injuryPrevention: true` (or that would be, on a dry run). */
  written: number;
  /** Accounts that had already chosen, left alone. */
  chosen: number;
}

const isObj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o);

export async function keepInjuryPrevention(db: Kysely<DB>, { apply }: { apply: boolean }): Promise<KeepResult> {
  return db.transaction().execute(async trx => {
    const users = await trx.selectFrom('users').select('id').orderBy('id').execute();
    let written = 0, chosen = 0;
    for (const { id: userId } of users) {
      await lockUser(trx, userId);
      const row = await trx.selectFrom('config').selectAll().where('user_id', '=', userId).executeTakeFirst();
      const data: Record<string, unknown> = row && !row.deleted_at && isObj(row.data) ? row.data : {};
      if (typeof data.injuryPrevention === 'boolean') { chosen++; continue; }
      written++;
      if (!apply) continue;
      const seq = await nextSeq(trx, userId);
      const json = { ...data, injuryPrevention: true } as never;
      if (row) await trx.updateTable('config').set({ data: json, deleted_at: null, version: row.version + 1, seq, updated_at: sql`now()` }).where('id', '=', row.id).execute();
      else await trx.insertInto('config').values({ user_id: userId, data: json, seq }).execute();
    }
    return { applied: apply, written, chosen };
  });
}
