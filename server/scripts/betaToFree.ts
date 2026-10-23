import type { Kysely } from 'kysely';
import type { DB } from '../db/types.ts';

// One-off (billing go-live, brief billing-go-live): every account on the `beta` plan moves to `free`, so it can subscribe (Checkout refuses a
// beta account and the Stripe webhook never changes one). Run by hand after a backup and after the default-free migration. Only plan `beta` rows
// change: free, paid, lifetime and founder accounts are left alone, and `plan_source` stays as it is (`manual`). Without `apply` nothing is
// written. Ids only, never an email or a name.

export interface BetaToFreeResult {
  applied: boolean;
  /** Accounts moved to free (or that would be, on a dry run). */
  moved: number;
  /** Accounts left alone because they were not on beta. */
  kept: number;
  /** The ids that were (or would be) moved, for the record. */
  ids: string[];
}

export async function betaToFree(db: Kysely<DB>, { apply }: { apply: boolean }): Promise<BetaToFreeResult> {
  return db.transaction().execute(async trx => {
    const betas = await trx.selectFrom('users').select('id').where('plan', '=', 'beta').orderBy('id').forUpdate().execute();
    const total = await trx.selectFrom('users').select(({ fn }) => fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
    const ids = betas.map(b => String(b.id));
    if (apply && ids.length) await trx.updateTable('users').set({ plan: 'free' }).where('id', 'in', betas.map(b => b.id)).execute();
    return { applied: apply, moved: ids.length, kept: Number(total.n) - ids.length, ids };
  });
}
