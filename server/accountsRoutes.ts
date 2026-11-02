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

export function accountsRoutes({ db, pii, signupCap }: { db: Kysely<DB>; pii?: PiiCrypto; signupCap?: number }): Router {
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
  router.post('/:id/suspend', change(true));
  router.post('/:id/restore', change(false));
  return router;
}
