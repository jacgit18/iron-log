import express from 'express';
import { sql, type Kysely } from 'kysely';
import { devAuth, inUserTransaction } from './auth.ts';
import { logSession } from './commands/logSession.ts';
import { tickCard } from './commands/tickCard.ts';
import { deleteBodyWeight, logBodyWeight } from './commands/bodyWeight.ts';
import { deleteEntry } from './commands/deleteEntry.ts';
import { deleteSupplementDay, saveSupplementDay } from './commands/supplementDays.ts';
import { deleteLibraryItem, deleteProgram, deleteStretchWeek, deleteWeek, saveConfig, saveLibraryItem, saveProgram, saveStretchWeek, saveWeek } from './commands/documents.ts';
import { untickCard } from './commands/untickCard.ts';
import { parseLimit, parseSince, syncPage } from './commands/sync.ts';
import type { DB } from './db/types.ts';

export interface AppDeps {
  db?: Kysely<DB>;
}

// The app is built here and listened on in index.ts, so tests can start it on a free port.
export function createApp({ db }: AppDeps = {}) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
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

  app.post('/api/commands/log-session', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => logSession(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.post('/api/commands/tick-card', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => tickCard(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.post('/api/commands/untick-card', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => untickCard(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.post('/api/commands/delete-entry', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => deleteEntry(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.post('/api/commands/log-body-weight', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => logBodyWeight(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.post('/api/commands/delete-body-weight', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => deleteBodyWeight(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.post('/api/commands/save-week', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => saveWeek(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.post('/api/commands/delete-week', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => deleteWeek(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.post('/api/commands/save-stretch-week', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => saveStretchWeek(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.post('/api/commands/delete-stretch-week', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => deleteStretchWeek(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.post('/api/commands/save-supplement-day', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => saveSupplementDay(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.post('/api/commands/delete-supplement-day', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => deleteSupplementDay(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.post('/api/commands/save-program', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => saveProgram(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.post('/api/commands/delete-program', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => deleteProgram(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.post('/api/commands/save-config', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => saveConfig(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.post('/api/commands/save-library-item', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => saveLibraryItem(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.post('/api/commands/delete-library-item', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => deleteLibraryItem(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.get('/api/sync', async (req, res) => {
    const since = parseSince(req.query.since);
    const limit = parseLimit(req.query.limit);
    if (since === null || limit === null) {
      res.status(400).json({ ok: false, error: 'since must be a whole number and limit between 1 and 500' });
      return;
    }
    const userId = String(res.locals.userId);
    res.json(await inUserTransaction(db!, userId, trx => syncPage(trx, userId, since, limit)));
  });

  return app;
}
