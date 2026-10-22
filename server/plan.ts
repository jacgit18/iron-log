import type { RequestHandler } from 'express';
import { sql, type Kysely } from 'kysely';
import { inUserTransaction, type Account } from './auth.ts';
import type { DB } from './db/types.ts';

// Who counts as a paid subscriber (feature flags, see src/features.ts). `users.plan` holds the tier; nothing in the app changes it
// yet, so the owner sets it by hand (`update users set plan = 'paid' where id = ...`) until a payment processor does. The tiers:
//   beta      the alpha and beta testers (every account made before billing); NOT paid. Move them to 'paid' or 'lifetime' to grandfather them. New accounts start on free since migration 20261022000003; `scripts/prod-db.sh beta-to-free` moves the rest.
//   free      signed up after billing, no subscription
//   paid      an active subscriber
//   lifetime  an early user given everything for good
//   founder   the owner
// An admin always counts as paid, so a paid feature can be tried without changing the admin's plan.
// The browser only ever hides a feature; anything with an API route behind it must also use requirePaid.

export const PAID_PLANS: ReadonlySet<string> = new Set(['paid', 'lifetime', 'founder']);

export const isPaidPlan = (plan: string | null | undefined): boolean => PAID_PLANS.has(plan ?? '');

/** Paid by plan, or an admin. */
export const isPaid = (plan: string | null | undefined, admin: boolean): boolean => admin || isPaidPlan(plan);

/** The signed-in user's plan, read inside their own transaction (row-level security shows them only their own row). */
export async function planOf(db: Kysely<DB>, userId: string): Promise<string> {
  return inUserTransaction(db, userId, async trx => {
    const { rows } = await sql<{ plan: string }>`select plan from users where id = current_setting('app.user_id')::bigint`.execute(trx);
    return rows[0]?.plan ?? 'free';
  });
}

/** For routes behind a paid-subscriber feature. Runs after sessionAuth, which sets res.locals.userId and res.locals.account. */
export function requirePaid(db: Kysely<DB>): RequestHandler {
  return async (_req, res, next) => {
    try {
      const account = res.locals.account as Account | undefined;
      if (account?.isAdmin === true || isPaidPlan(await planOf(db, String(res.locals.userId)))) return next();
      res.status(402).json({ ok: false, error: 'a paid plan is needed' });
    } catch (err) {
      console.error(JSON.stringify({ msg: 'could not read the plan', error: err instanceof Error ? err.message : String(err) }));
      res.status(503).json({ ok: false, error: 'plan unavailable' });
    }
  };
}
