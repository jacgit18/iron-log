import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import { sql, type Kysely } from 'kysely';
import { sessionAuth, devAuthAllowed, inUserTransaction, type Account } from './auth.ts';
import type { Auth } from './auth/betterAuth.ts';
import { clientErrors } from './clientErrors.ts';
import { clientVersionGate } from './clientVersion.ts';
import { originGuard } from './originGuard.ts';
import { byUser, rateLimit, type Limit } from './rateLimit.ts';
import { securityHeaders } from './securityHeaders.ts';
import { AUTH_CHECK_PAGE } from './dev/authCheckPage.ts';
import { deleteMyAccount, eraseMyData } from './commands/account.ts';
import { importLegacy } from './commands/importLegacy.ts';
import { logSession } from './commands/logSession.ts';
import { tickCard } from './commands/tickCard.ts';
import { deleteBodyWeight, logBodyWeight } from './commands/bodyWeight.ts';
import { deleteEntry } from './commands/deleteEntry.ts';
import { deleteSupplementDay, saveSupplementDay } from './commands/supplementDays.ts';
import { deleteLibraryItem, deleteListItem, deleteProgram, deleteStretchWeek, deleteWeek, saveConfig, saveLibraryItem, saveListItem, saveProgram, saveStretchWeek, saveWeek } from './commands/documents.ts';
import { untickCard } from './commands/untickCard.ts';
import { parseLimit, parseSince, syncPage } from './commands/sync.ts';
import type { DB } from './db/types.ts';

export interface AppDeps {
  db?: Kysely<DB>;
  /** The built PWA (dist/). When set, the app is served from the same origin as the API (ADR 010). */
  staticDir?: string;
  /** The oldest app build allowed to sync (see clientVersion.ts); null or unset for no gate. */
  minClientVersion?: number | null;
  /** Better Auth (see auth/betterAuth.ts). When set, its routes are served under /api/auth. */
  auth?: Auth;
  /** Origins, besides this server's own host, whose browsers may send state-changing requests (see originGuard.ts). */
  allowedOrigins?: string[];
  /** Express's `trust proxy`: how many proxies sit in front (1 on Cloud Run), so the client IP and https come from X-Forwarded-*. Unset trusts none. */
  trustProxy?: number | boolean;
  /** Limits on /api/auth per client IP: starting a sign-in is the expensive, abusable call. Defaults below. */
  authLimits?: { signIn: Limit; other: Limit };
  /** Limits on the rest of the API (see LIMITS). They are generous: a phone back online after two days sends a burst. */
  limits?: Partial<typeof LIMITS>;
}

const AUTH_LIMITS = { signIn: { max: 10, windowMs: 60_000 }, other: { max: 120, windowMs: 60_000 } };

// One signed-in phone sends a pull a minute and a few commands per change, and a burst when it comes back online. These stop a script
// or a loop, not a person. A limited call gets 429 and Retry-After, which the phone treats as "wait and try again", never "drop it".
// `api` is per client address and is checked before the session lookup, so anonymous calls cannot cost database round trips.
const LIMITS = {
  api: { max: 1200, windowMs: 60_000 } as Limit,
  commands: { max: 600, windowMs: 60_000 } as Limit,
  sync: { max: 120, windowMs: 60_000 } as Limit,
  importLegacy: { max: 10, windowMs: 60 * 60_000 } as Limit,
  clientErrors: { max: 20, windowMs: 60_000 } as Limit,
  // Erasing data or deleting the account: a handful an hour is already far more than anyone means to do.
  account: { max: 5, windowMs: 60 * 60_000 } as Limit,
};

const NO_CACHE = 'no-cache';
const IMMUTABLE = 'public, max-age=31536000, immutable';
const ONE_HOUR = 'public, max-age=3600';

// Vite names everything under /assets/ by content hash, so those files can be cached for good. The service worker, the
// page, the manifest and the Workbox runtime must always be re-checked, or an update would never reach the phone.
function cacheControl(file: string, root: string): string {
  const name = file.slice(root.length + 1).replaceAll('\\', '/');
  if (name.startsWith('assets/')) return IMMUTABLE;
  if (/^(index\.html|sw\.js|registerSW\.js|manifest\.webmanifest|workbox-[\w-]+\.js)$/.test(name)) return NO_CACHE;
  return ONE_HOUR;
}

// The app is built here and listened on in index.ts, so tests can start it on a free port.
export function createApp({ db, staticDir, minClientVersion = null, auth, allowedOrigins, trustProxy, authLimits = AUTH_LIMITS, limits: limitOverrides }: AppDeps = {}) {
  const limits = { ...LIMITS, ...limitOverrides };
  const app = express();
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);
  app.use(securityHeaders());
  // Before Better Auth and every body parser: a cross-origin write is refused without being read.
  app.use('/api', originGuard(allowedOrigins));
  // Better Auth reads the request body itself, so its routes come before any body parser.
  if (auth) {
    // Starting a sign-in (and, in tests, an email sign-in) is limited hard; reading the session, which the app does often, is not.
    app.use('/api/auth/sign-in', rateLimit(authLimits.signIn));
    app.use('/api/auth', rateLimit(authLimits.other));
    app.all('/api/auth/*splat', toNodeHandler(auth));
  }
  // The phone's error reports: anyone may send one (a signed-out phone has errors too), so they are small, rate-limited and scrubbed.
  app.post('/api/client-errors', rateLimit(limits.clientErrors), express.json({ limit: '4kb' }), clientErrors());
  // The one-time upload of a phone's old data is far bigger than any other request (years of entries), so it alone gets a larger limit.
  app.use('/api/commands/import-legacy', express.json({ limit: '4mb' }));
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

  // An app older than the minimum is told so before anything else, signed in or not, so it stops sending and keeps its data.
  app.use(['/api/commands', '/api/sync'], clientVersionGate({ min: minClientVersion, allowDev: devAuthAllowed(process.env.NODE_ENV) }));

  // A page for trying real sign-in by hand while developing (Google on a desktop, later the phone). Not served anywhere else.
  if (auth && process.env.NODE_ENV === 'development') app.get('/dev/auth', (_req, res) => void res.type('html').send(AUTH_CHECK_PAGE));

  // Everything below this line needs a signed-in user. The per-address limit comes first, so an anonymous flood never reaches the database.
  app.use('/api', rateLimit(limits.api));
  app.use('/api', db ? sessionAuth(db, auth) : (_req, res) => void res.status(503).json({ ok: false, error: 'database not configured' }));
  // Per signed-in user, after the lookup.
  app.use('/api/commands/import-legacy', rateLimit(limits.importLegacy, undefined, byUser));
  app.use('/api/commands', rateLimit(limits.commands, undefined, byUser));
  app.use('/api/sync', rateLimit(limits.sync, undefined, byUser));
  app.post('/api/account/erase-data', rateLimit(limits.account, undefined, byUser), async (req, res) => {
    const result = await eraseMyData(db!, String(res.locals.userId), req.body);
    res.status(result.status).json(result.body);
  });
  app.post('/api/account/delete', rateLimit(limits.account, undefined, byUser), async (req, res) => {
    const result = await deleteMyAccount(db!, String(res.locals.userId), req.body);
    res.status(result.status).json(result.body);
  });
  app.get('/api/me', async (_req, res) => {
    const userId = String(res.locals.userId);
    const row = await inUserTransaction(db!, userId, async trx => (await sql<{ id: string }>`select current_setting('app.user_id') as id`.execute(trx)).rows[0]);
    res.json({ ok: true, userId: row?.id, minClientVersion, account: res.locals.account as Account });
  });

  app.post('/api/commands/import-legacy', async (req, res) => {
    const userId = String(res.locals.userId);
    const result = await importLegacy(db!, userId, req.body, req.get('x-client-version') ?? null);
    res.status(result.status).json(result.body);
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

  app.post('/api/commands/save-list-item', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => saveListItem(trx, userId, req.body, clientVersion));
    res.status(result.status).json(result.body);
  });

  app.post('/api/commands/delete-list-item', async (req, res) => {
    const userId = String(res.locals.userId);
    const clientVersion = req.get('x-client-version') ?? null;
    const result = await inUserTransaction(db!, userId, trx => deleteListItem(trx, userId, req.body, clientVersion));
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

  // Anything under /api that no route answered is a JSON 404, never the app's page.
  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: 'not found' });
  });

  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    const root = resolve(staticDir);
    app.use(express.static(root, { index: false, setHeaders: (res, file) => void res.setHeader('Cache-Control', cacheControl(file, root)) }));
    // A page route (no file extension) gets the app, which draws it. A missing file (/assets/old.js) stays a 404, so a
    // stale link never receives HTML where JavaScript was expected. /.well-known has no files, as on GitHub Pages.
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || extname(req.path) !== '' || req.path.startsWith('/.well-known/')) return next();
      res.set('Cache-Control', NO_CACHE).sendFile(join(root, 'index.html'));
    });
  }

  return app;
}
