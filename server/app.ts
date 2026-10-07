import express from 'express';
import { sql, type Kysely } from 'kysely';
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

  return app;
}
