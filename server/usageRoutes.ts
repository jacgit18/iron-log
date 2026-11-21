import { Router } from 'express';
import { sql, type Kysely } from 'kysely';
import type { UsageOverview } from '../src/shared/usage.ts';
import { inUserTransaction } from './auth.ts';
import type { DB } from './db/types.ts';

// The admin Usage screen's API, mounted at /api/usage-admin behind sign-in, requireAdmin and a per-user limit. One read, through
// list_usage(), which checks users.is_admin again in the database; a refusal from there (SQLSTATE 42501) is answered 403.

/** `?days=` 1 to 90 (default 30); null when it is not acceptable. */
export function parseDays(query: Record<string, unknown>): number | null {
  const { days } = query;
  if (days === undefined) return 30;
  return typeof days === 'string' && /^\d{1,2}$/.test(days) && Number(days) >= 1 && Number(days) <= 90 ? Number(days) : null;
}

const notAllowed = (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === '42501';

export function usageRoutes({ db }: { db: Kysely<DB> }): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    const days = parseDays(req.query);
    if (days === null) return void res.status(422).json({ ok: false, error: 'days is 1 to 90' });
    try {
      const overview = await inUserTransaction(db, String(res.locals.userId), async trx =>
        (await sql<{ overview: UsageOverview }>`select list_usage(${days}) as overview`.execute(trx)).rows[0]!.overview);
      res.json({ ok: true, ...overview });
    } catch (err) {
      if (notAllowed(err)) return void res.status(403).json({ ok: false, error: 'not available' });
      throw err;
    }
  });
  return router;
}
