import express from 'express';
import { sql, type Kysely } from 'kysely';
import { devAuth, inUserTransaction } from './auth.ts';
import type { DB } from './db/types.ts';

export interface AppDeps {
  db?: Kysely<DB>;
}

// The app is built here and listened on in index.ts, so tests can start it on a free port.
export function createApp({ db }: AppDeps = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/health/db', async (_req, res) => {
    if (!db) {
      res.status(503).json({ ok: false, error: 'database not configured' });
      return;
    }
    try {
      await sql`select 1`.execute(db);
      res.json({ ok: true });
    } catch (err) {
      console.error(JSON.stringify({ msg: 'database health check failed', error: err instanceof Error ? err.message : String(err) }));
      res.status(503).json({ ok: false, error: 'database unreachable' });
    }
  });

  // Everything below this line needs a signed-in user.
  app.use('/api', db ? devAuth(db) : (_req, res) => void res.status(503).json({ ok: false, error: 'database not configured' }));
  app.get('/api/me', async (_req, res) => {
    const userId = String(res.locals.userId);
    const row = await inUserTransaction(db!, userId, async trx => (await sql<{ id: string }>`select current_setting('app.user_id') as id`.execute(trx)).rows[0]);
    res.json({ ok: true, userId: row?.id });
  });

  return app;
}
