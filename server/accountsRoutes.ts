import { Router } from 'express';
import { sql, type Kysely } from 'kysely';
import { inUserTransaction } from './auth.ts';
import type { PiiCrypto } from './auth/piiCrypto.ts';
import type { DB } from './db/types.ts';
import { maskEmail } from '../src/shared/maskEmail.ts';

// The admin accounts screen's API (brief admin-accounts-screen, backlog B7), mounted at /api/accounts behind sign-in, requireAdmin and a
// per-user limit. Everything goes through list_accounts / set_account_suspended, which check users.is_admin again in the database; a
// refusal from there (SQLSTATE 42501) is answered 403, the same as a refusal here. The page gets account number, masked email, plan, join
// date and flags: never a name, a full address or any content. The sealed address is opened here and masked before it leaves.

interface AccountRow { id: string | number; plan: string; isAdmin: boolean; created_at: string; suspended: boolean; sealedEmail: string | null; dev: boolean }
interface ActionRow { id: string | number; action: string; adminId: string | number | null; targetId: string | number | null; created_at: string }
interface Overview { counts: { total: number; paid: number; suspended: number }; accounts: AccountRow[]; actions: ActionRow[] }

const iso = (t: string) => new Date(t).toISOString();
const notAllowed = (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === '42501';
const refusedTarget = (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === '22023';
export const LIST_SIZE = 50;

/** The label for one row: a development user is `dev account`; a stored address is opened and masked; anything unreadable is `account`. */
export function labelFor(row: Pick<AccountRow, 'dev' | 'sealedEmail'>, pii?: PiiCrypto): string {
  if (row.dev) return 'dev account';
  if (!row.sealedEmail) return 'account';
  try { return maskEmail(pii ? pii.open(row.sealedEmail) : row.sealedEmail); } catch { return 'account'; }
}

export interface AccountsDeps {
  db: Kysely<DB>;
  pii?: PiiCrypto;
  signupCap?: number;
  /** Ends a Stripe customer (and its subscriptions) before an account is deleted; unset when billing is off. A throw means nothing is deleted. */
  deleteCustomer?: (customerId: string) => Promise<void>;
  /** Clears the emailed sign-in codes made for an address (Better Auth keeps them under the address); unset when sign-in is off. */
  purgeCodes?: (email: string) => Promise<void>;
}

export function accountsRoutes({ db, pii, signupCap, deleteCustomer, purgeCodes }: AccountsDeps): Router {
  const router = Router();
  const asAdmin = <T>(userId: unknown, fn: Parameters<typeof inUserTransaction<T>>[2]) => inUserTransaction(db, String(userId), fn);

  router.get('/', async (_req, res) => {
    try {
      const o = await asAdmin(res.locals.userId, async trx =>
        (await sql<{ o: Overview }>`select list_accounts(${LIST_SIZE}) as o`.execute(trx)).rows[0]!.o);
      res.json({
        ok: true,
        cap: signupCap ?? null,
        counts: { total: Number(o.counts.total), paid: Number(o.counts.paid), suspended: Number(o.counts.suspended) },
        accounts: o.accounts.map(a => ({ id: String(a.id), label: labelFor(a, pii), plan: a.plan, isAdmin: a.isAdmin, joined: iso(a.created_at), suspended: a.suspended })),
        actions: o.actions.map(a => ({ id: String(a.id), action: a.action, adminId: a.adminId === null ? null : String(a.adminId), targetId: a.targetId === null ? null : String(a.targetId), at: iso(a.created_at) })),
      });
    } catch (err) {
      if (notAllowed(err)) return void res.status(403).json({ ok: false, error: 'not available' });
      throw err;
    }
  });

  const change = (suspend: boolean) => async (req: import('express').Request, res: import('express').Response) => {
    const id = String(req.params.id ?? '');
    if (!/^[1-9]\d{0,17}$/.test(id)) return void res.status(422).json({ ok: false, error: 'send an account number' });
    try {
      const result = await asAdmin(res.locals.userId, async trx =>
        (await sql<{ r: string }>`select set_account_suspended(${id}::bigint, ${suspend}) as r`.execute(trx)).rows[0]!.r);
      if (result === 'unknown') return void res.status(404).json({ ok: false, error: 'no such account' });
      res.json({ ok: true, changed: result === 'done' });
    } catch (err) {
      if (notAllowed(err)) return void res.status(403).json({ ok: false, error: 'not available' });
      if (refusedTarget(err)) return void res.status(422).json({ ok: false, error: 'an admin account cannot be suspended' });
      throw err;
    }
  };
  // Delete forever (brief admin-delete-account): only a suspended, non-admin account other than the caller's, and only with its own number typed
  // as `confirm`. Order: read what is needed, end the Stripe customer, clear the codes, then the database function deletes (and re-checks).
  router.post('/:id/delete', async (req, res) => {
    const id = String(req.params.id ?? '');
    if (!/^[1-9]\d{0,17}$/.test(id)) return void res.status(422).json({ ok: false, error: 'send an account number' });
    const confirm = (req.body as { confirm?: unknown } | undefined)?.confirm;
    if (confirm !== id) return void res.status(422).json({ ok: false, error: `send {"confirm":"${id}"} to delete the account` });
    let endedStripe = false;
    try {
      const info = await asAdmin(res.locals.userId, async trx =>
        (await sql<{ i: { sealedEmail: string | null; stripeCustomerId: string | null } | null }>`select admin_account_for_delete(${id}::bigint) as i`.execute(trx)).rows[0]!.i);
      if (!info) return void res.status(404).json({ ok: false, error: 'no such account' });
      // Known narrow race: Stripe cannot join the database transaction, so the customer is ended before the delete re-checks the account. If another
      // admin presses Restore in that gap the delete is refused (below) with the customer already gone; that case is logged and said out loud.
      try {
        if (info.stripeCustomerId && deleteCustomer) { await deleteCustomer(info.stripeCustomerId); endedStripe = true; }
      } catch (err) {
        console.error(JSON.stringify({ msg: 'could not end the subscription before an admin deleted an account', error: err instanceof Error ? err.message : String(err) }));
        return void res.status(503).json({ ok: false, error: 'could not cancel the subscription, so nothing was deleted; try again' });
      }
      try {
        if (info.sealedEmail && purgeCodes) {
          const email = pii ? pii.open(info.sealedEmail) : info.sealedEmail;
          if (email.includes('@')) await purgeCodes(email);
        }
      } catch (err) {
        // The codes expire by themselves; a failure here must not leave a half-done delete.
        console.error(JSON.stringify({ msg: 'could not clear the emailed codes for an account an admin is deleting', error: err instanceof Error ? err.message : String(err) }));
      }
      const result = await asAdmin(res.locals.userId, async trx =>
        (await sql<{ r: string }>`select admin_delete_account(${id}::bigint) as r`.execute(trx)).rows[0]!.r);
      if (result === 'unknown') return void res.status(404).json({ ok: false, error: 'no such account' });
      console.log(JSON.stringify({ msg: 'account deleted by an admin' }));
      res.json({ ok: true });
    } catch (err) {
      if (notAllowed(err)) return void res.status(403).json({ ok: false, error: 'not available' });
      if (refusedTarget(err)) {
        if (endedStripe) {
          console.error(JSON.stringify({ msg: 'an admin delete was refused after the Stripe customer was ended: the account changed in between', accountId: id }));
          return void res.status(409).json({ ok: false, error: 'the account changed while it was being deleted, nothing was deleted, but its subscription was already ended; check it' });
        }
        return void res.status(422).json({ ok: false, error: err instanceof Error && /suspend/.test(err.message) ? 'suspend the account first' : 'an admin account cannot be deleted' });
      }
      throw err;
    }
  });
  router.post('/:id/suspend', change(true));
  router.post('/:id/restore', change(false));
  return router;
}
