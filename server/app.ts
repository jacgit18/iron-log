import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { toNodeHandler } from 'better-auth/node';
import { personaByEmail } from './qa/personas.ts';
import compression from 'compression';
import express from 'express';
import { sql, type Kysely, type Transaction } from 'kysely';
import { requireAdmin, type Admins } from './admin.ts';
import { assetLinksRoute } from './assetLinks.ts';
import { canonicalHost } from './canonicalHost.ts';
import { isPaid, requirePaid } from './plan.ts';
import { sessionAuth, devAuthAllowed, inUserTransaction, type Account } from './auth.ts';
import type { Auth } from './auth/betterAuth.ts';
import { bodyLimit } from './bodyLimit.ts';
import { LISTED_KINDS, listCatalog, parseSearch, searchCatalog } from './catalog.ts';
import { clientErrors } from './clientErrors.ts';
import { clientVersionGate } from './clientVersion.ts';
import { errorHandler } from './errorHandler.ts';
import { expectedUserGate } from './expectedUser.ts';
import { issueRecorder } from './issues.ts';
import { foodRoutes, type FoodDeps } from './foodSearch.ts';
import { issuesRoutes } from './issuesRoutes.ts';
import { backupsRoutes } from './backups.ts';
import { ADMIN_ONLY, billingRoutes, billingSummary, cancelBillingFor, webhookRoute, type BillingConfig, type StripeApi } from './billing.ts';
import { originGuard } from './originGuard.ts';
import { fireRoute, type FireDeps } from './push/fire.ts';
import { pushRoutes } from './push/routes.ts';
import type { PushScheduler } from './push/scheduler.ts';
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
import { deleteGroceryMonth, deleteLibraryItem, deleteListItem, deleteProgram, deleteStretchWeek, deleteWeek, saveConfig, saveGroceryMonth, saveLibraryItem, saveListItem, saveProgram, saveStretchWeek, saveWeek } from './commands/documents.ts';
import { untickCard } from './commands/untickCard.ts';
import { parseLimit, parseSince, syncPage } from './commands/sync.ts';
import type { DB } from './db/types.ts';
import { repairBody } from './wellFormed.ts';

export interface AppDeps {
  db?: Kysely<DB>;
  /** The built PWA (dist/). When set, the app is served from the same origin as the API (ADR 010). */
  staticDir?: string;
  /** The oldest app build allowed to sync (see clientVersion.ts); null or unset for no gate. */
  minClientVersion?: number | null;
  /** Better Auth (see auth/betterAuth.ts). When set, its routes are served under /api/auth. */
  auth?: Auth;
  /** Who is an admin (see admin.ts); unset means nobody. */
  admins?: Admins;
  /** Origins, besides this server's own host, whose browsers may send state-changing requests (see originGuard.ts). */
  allowedOrigins?: string[];
  /** BASE_URL: a browser that opens this server on a different *.run.app address is redirected here (canonicalHost.ts). */
  canonicalOrigin?: string;
  /** Express's `trust proxy`: how many proxies sit in front (1 on Cloud Run), so the client IP and https come from X-Forwarded-*. Unset trusts none. */
  trustProxy?: number | boolean;
  /** Limits on /api/auth per client IP: starting a sign-in is the expensive, abusable call. Defaults below. */
  authLimits?: { signIn: Limit; other: Limit };
  /** Web Push (ADR 044): the public VAPID key the browser subscribes with, and what schedules a later send. Without a key the routes answer 503. */
  push?: { publicKey?: string; scheduler?: PushScheduler; now?: () => number; fire?: Pick<FireDeps, 'verify' | 'send'> };
  /** Stripe billing (ADR 065). Unset: the billing routes answer 503 and /api/me says billing is not available. */
  billing?: { api: StripeApi; config: BillingConfig };
  /** Food search (brief diet-food-lookup): the USDA key and, in tests, a stand-in for fetch. Unset key: the route answers 503. */
  foods?: FoodDeps;
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
  // The database health check runs a query and is public, so it is limited per address and its answer is reused for a few seconds.
  healthDb: { max: 30, windowMs: 60_000 } as Limit,
  // Erasing data or deleting the account: a handful an hour is already far more than anyone means to do.
  account: { max: 5, windowMs: 60 * 60_000 } as Limit,
  // Push: a timer or a tick schedules or cancels, so a busy session sends a few a minute. A loop is what this stops.
  push: { max: 60, windowMs: 60_000 } as Limit,
  // Billing: a person pressing Upgrade or Manage billing. The webhook is Stripe's, per address, and far above its real rate: a 429 makes Stripe retry later.
  billing: { max: 20, windowMs: 60_000 } as Limit,
  stripeWebhook: { max: 600, windowMs: 60_000 } as Limit,
  // The admin Issues screen: a person reading a list and changing a status, a few calls a minute at most.
  issues: { max: 60, windowMs: 60_000 } as Limit,
  // Food search: a person typing, one request per pause. The daily allowance is in foodSearch.ts.
  foods: { max: 20, windowMs: 60_000 } as Limit,
  // Server backup history (ADR 066): the app uploads once a day and reads the list in Settings; a loop is what this stops.
  backups: { max: 30, windowMs: 60_000 } as Limit,
  // Cloud Tasks calling the fire route: per address (a few Google ones), checked before the token. A 429 would push an alert past its
  // 90 s window and lose it, so this is far above any real traffic; the token is what keeps others out.
  pushFire: { max: 1200, windowMs: 60_000 } as Limit,
};

const DB_HEALTH_TTL_MS = 5_000;
/** The path Express matches for `app.use('/api/commands/import-legacy')`: a prefix on a segment boundary, any letter case. */
const IMPORT_LEGACY_PATH = /^\/api\/commands\/import-legacy(\/|$)/i;

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
export function createApp({ db, staticDir, minClientVersion = null, auth, admins, allowedOrigins, canonicalOrigin, trustProxy, authLimits = AUTH_LIMITS, limits: limitOverrides, push, billing, foods }: AppDeps = {}) {
  const limits = { ...LIMITS, ...limitOverrides };
  const app = express();
  const recordIssue = db ? issueRecorder(db) : undefined;
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);
  // First of all: a browser opening the old Cloud Run address goes to the custom domain (BASE_URL) before anything else runs.
  app.use(canonicalHost(canonicalOrigin));
  app.use(securityHeaders());
  // gzip/brotli for the app's scripts and the sync pages: Cloud Run does not compress, and the first load is on a phone's connection.
  app.use(compression());
  // Before Better Auth and every body parser: a cross-origin write is refused without being read.
  app.use('/api', originGuard(allowedOrigins));
  // Better Auth reads the request body itself, so its routes come before any body parser.
  if (auth) {
    // What the sign-in screen may offer someone who is not signed in. Public on purpose; it names no address and no secret.
    app.get('/api/auth-options', rateLimit(authLimits.other), (_req, res, next) => { auth.qaPersonasOn().then(qaPersonas => res.json({ ok: true, emailCode: auth.emailCode.open, qaPersonas }), next); });
    // Starting a sign-in (and, in tests, an email sign-in) is limited hard; reading the session, which the app does often, is not.
    app.use('/api/auth/sign-in', rateLimit(authLimits.signIn));
    // Asking for an emailed code costs an email, so it is limited as hard as signing in.
    app.use('/api/auth/email-otp', rateLimit(authLimits.signIn));
    app.use('/api/auth', rateLimit(authLimits.other));
    // Better Auth buffers a whole body before it checks it, so the size is judged first (bodyLimit.ts).
    app.use('/api/auth', bodyLimit());
    app.all('/api/auth/*splat', toNodeHandler(auth));
  }
  // The phone's error reports: anyone may send one (a signed-out phone has errors too), so they are small, rate-limited and scrubbed.
  app.post('/api/client-errors', rateLimit(limits.clientErrors), express.json({ limit: '4kb' }), repairBody, clientErrors(recordIssue));
  // Stripe's webhook: no sign-in, and its body must reach the signature check as the exact bytes, so it comes before every JSON parser.
  if (db) app.post('/api/stripe/webhook', rateLimit(limits.stripeWebhook), ...webhookRoute(db, billing?.api));
  // The one-time upload of a phone's old data is far bigger than any other request (years of entries), so it alone gets a larger limit,
  // but only once the caller is signed in and counted (below, after sessionAuth and its per-user limit). Before that it gets no parser
  // at all: an anonymous caller must not be able to make the one small instance buffer and parse 4 MB per request (audit run-2).
  const smallJson = express.json({ limit: '100kb' });
  app.use((req, res, next) => (IMPORT_LEGACY_PATH.test(req.path) ? next() : smallJson(req, res, next)));
  app.use(repairBody); // a note clipped through an emoji must not reach the database as a lone surrogate (it was a 500; overnight audit S-1)
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  let dbHealth: { at: number; ok: boolean } | undefined;
  app.get('/api/health/db', rateLimit(limits.healthDb), async (_req, res) => {
    if (!db) {
      res.status(503).json({ ok: false, error: 'database not configured' });
      return;
    }
    if (!dbHealth || Date.now() - dbHealth.at >= DB_HEALTH_TTL_MS) {
      try {
        await sql`select 1`.execute(db);
        dbHealth = { at: Date.now(), ok: true };
      } catch (err) {
        console.error(JSON.stringify({ msg: 'database health check failed', error: err instanceof Error ? err.message : String(err) }));
        dbHealth = { at: Date.now(), ok: false };
      }
    }
    if (dbHealth.ok) res.json({ ok: true });
    else res.status(503).json({ ok: false, error: 'database unreachable' });
  });

  // An app older than the minimum is told so before anything else, signed in or not, so it stops sending and keeps its data.
  app.use(['/api/commands', '/api/sync'], clientVersionGate({ min: minClientVersion, allowDev: devAuthAllowed(process.env.NODE_ENV) }));

  // The one file served under /.well-known: the Android app's Digital Asset Links, built from env vars on each request (assetLinks.ts). 404 until they are set.
  app.get('/.well-known/assetlinks.json', assetLinksRoute());

  // A page for trying real sign-in by hand while developing (Google on a desktop, later the phone). Not served anywhere else.
  if (auth && process.env.NODE_ENV === 'development') app.get('/dev/auth', (_req, res) => void res.type('html').send(AUTH_CHECK_PAGE));

  // Cloud Tasks calls this at the time a push is due: no person, no session, only a Google-signed token (push/fire.ts). Not an admin route.
  if (db && push?.fire) app.use('/api/push', fireRoute({ db, now: push.now, scheduler: push.scheduler, ...push.fire, limit: rateLimit(limits.pushFire) }));

  // Everything below this line needs a signed-in user. The per-address limit comes first, so an anonymous flood never reaches the database.
  // Nothing signed-in is stored by the browser or a proxy: Back on a shared phone must not replay another account's answer. A route that
  // wants a short private cache (the catalog, backups) sets its own header after this.
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  app.use('/api', rateLimit(limits.api));
  app.use('/api', db ? sessionAuth(db, auth, admins) : (_req, res) => void res.status(503).json({ ok: false, error: 'database not configured' }));
  // A page that holds another account's data is refused before any route runs (server/expectedUser.ts).
  app.use(['/api/commands', '/api/sync', '/api/backups'], expectedUserGate());
  // Per signed-in user, after the lookup.
  app.use('/api/commands/import-legacy', rateLimit(limits.importLegacy, undefined, byUser));
  app.use('/api/commands/import-legacy', express.json({ limit: '4mb' }), repairBody);
  app.use('/api/commands', rateLimit(limits.commands, undefined, byUser));
  app.use('/api/sync', rateLimit(limits.sync, undefined, byUser));
  // The admin Issues screen (ADR 013 amendment): admin-only, and the database checks users.is_admin again.
  // Billing (ADR 065): admin-only while Stripe is in test mode (ADMIN_ONLY in billing.ts).
  if (db) app.use('/api/billing', ...(ADMIN_ONLY ? [requireAdmin] : []), rateLimit(limits.billing, undefined, byUser), billingRoutes({ db, api: billing?.api, config: billing?.config }));
  // Server backup history (ADR 066): paid subscribers and admins only (owner, 2026-10-22), 30 days; a free account gets 402. The 1 MB body parser is on the PUT route only.
  if (db) app.use('/api/backups', clientVersionGate({ min: minClientVersion ?? 0, allowDev: devAuthAllowed(process.env.NODE_ENV) }), rateLimit(limits.backups, undefined, byUser), requirePaid(db), backupsRoutes({ db }));
  if (db) app.use('/api/foods', rateLimit(limits.foods, undefined, byUser), foodRoutes(foods));
  if (db) app.use('/api/issues', requireAdmin, rateLimit(limits.issues, undefined, byUser), issuesRoutes({ db }));
  // Web Push (ADR 044): released to every signed-in account 2026-10-19; the per-user limit below is the cost guard.
  if (db) app.use('/api/push', rateLimit(limits.push, undefined, byUser), pushRoutes({ db, publicKey: push?.publicKey, scheduler: push?.scheduler, now: push?.now }));
  app.post('/api/account/erase-data', rateLimit(limits.account, undefined, byUser), async (req, res) => {
    const result = await eraseMyData(db!, String(res.locals.userId), req.body);
    res.status(result.status).json(result.body);
  });
  app.post('/api/account/delete', rateLimit(limits.account, undefined, byUser), async (req, res) => {
    const email = (res.locals.account as Account).email;
    // Better Auth keeps a code under `<kind>-otp-<email>`; every kind is cleared, so nothing carrying the address is left after the account goes.
    const purge = auth && email ? async () => { const adapter = (await auth.$context).internalAdapter; for (const kind of ['sign-in', 'email-verification', 'forget-password']) await adapter.deleteVerificationByIdentifier(`${kind}-otp-${email.toLowerCase()}`); } : undefined;
    const userId = String(res.locals.userId);
    const result = await deleteMyAccount(db!, userId, req.body, purge, () => cancelBillingFor(db!, billing?.api)(userId));
    res.status(result.status).json(result.body);
  });
  app.get('/api/me', async (_req, res) => {
    const userId = String(res.locals.userId);
    const row = await inUserTransaction(db!, userId, async trx => (await sql<{ id: string; plan: string | null }>`select current_setting('app.user_id') as id, (select plan from users where id = current_setting('app.user_id')::bigint) as plan`.execute(trx)).rows[0]);
    const account = res.locals.account as Account;
    // QA only (qaPersonas.ts): whether this session is a test account, and whether an admin may switch. Absent everywhere else, so production's answer is unchanged.
    const qa = auth && (await auth.qaPersonasOn()) ? { persona: personaByEmail(account.email)?.name ?? null, canSwitch: account.isAdmin === true } : undefined;
    res.json({ ok: true, userId: row?.id, minClientVersion, ...(qa ? { qa } : {}), account: { ...account, plan: row?.plan ?? 'free', isPaid: isPaid(row?.plan, account.isAdmin), billing: await billingSummary(db!, userId, account.isAdmin, !!billing) } });
  });

  app.post('/api/commands/import-legacy', async (req, res) => {
    const userId = String(res.locals.userId);
    const result = await importLegacy(db!, userId, req.body, req.get('x-client-version') ?? null);
    res.status(result.status).json(result.body);
  });

  // A command route: runs the command inside the signed-in user's transaction and sends its status and body. Every command has this shape.
  const command = (path: string, run: (trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null) => Promise<{ status: number; body: unknown }>) =>
    app.post(path, async (req, res) => {
      const userId = String(res.locals.userId);
      const result = await inUserTransaction(db!, userId, trx => run(trx, userId, req.body, req.get('x-client-version') ?? null));
      res.status(result.status).json(result.body);
    });

  command('/api/commands/log-session', logSession);

  command('/api/commands/tick-card', tickCard);

  command('/api/commands/untick-card', untickCard);

  command('/api/commands/delete-entry', deleteEntry);

  command('/api/commands/log-body-weight', logBodyWeight);

  command('/api/commands/delete-body-weight', deleteBodyWeight);

  command('/api/commands/save-week', saveWeek);

  command('/api/commands/delete-week', deleteWeek);

  command('/api/commands/save-stretch-week', saveStretchWeek);

  command('/api/commands/delete-stretch-week', deleteStretchWeek);

  command('/api/commands/save-supplement-day', saveSupplementDay);

  command('/api/commands/delete-supplement-day', deleteSupplementDay);

  command('/api/commands/save-program', saveProgram);

  command('/api/commands/delete-program', deleteProgram);

  command('/api/commands/save-config', saveConfig);

  command('/api/commands/save-library-item', saveLibraryItem);

  command('/api/commands/delete-library-item', deleteLibraryItem);

  command('/api/commands/save-list-item', saveListItem);

  command('/api/commands/delete-list-item', deleteListItem);

  command('/api/commands/save-grocery-month', saveGroceryMonth);

  command('/api/commands/delete-grocery-month', deleteGroceryMonth);

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

  // The catalog to browse and add from (ADR 025), for every signed-in account. The browser checks back every time, so rows from an
  // import show at once; the ETag Express adds turns an unchanged list into a small 304.
  // Supplements are searched a page at a time (ADR 029). The same answer for the same words until the next import, so a short private
  // cache is fine. Registered before /api/catalog so the path is not taken for a list.
  app.get('/api/catalog/search', async (req, res) => {
    const search = parseSearch(req.query);
    if (!search) {
      res.status(400).json({ ok: false, error: 'kind must be supplement or recipe, q 2 to 100 characters (recipes may leave it out) and at most 6 words, cat a recipe category (recipes only), offset a whole number up to 600' });
      return;
    }
    res.set('Cache-Control', 'private, max-age=300');
    res.json({ ok: true, ...(await searchCatalog(db!, String(res.locals.userId), search)) });
  });

  app.get('/api/catalog', async (req, res) => {
    const kind = LISTED_KINDS.find(k => k === req.query.kind);
    if (!kind) {
      res.status(400).json({ ok: false, error: `kind must be one of ${LISTED_KINDS.join(', ')}` });
      return;
    }
    res.set('Cache-Control', 'private, no-cache');
    res.json({ ok: true, items: await listCatalog(db!, String(res.locals.userId), kind) });
  });

  // Anything under /api that no route answered is a JSON 404, never the app's page.
  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: 'not found' });
  });

  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    const root = resolve(staticDir);
    // The public account-deletion page (Google Play's Data safety form links to this address). It is a plain file, so it reads signed out and without script.
    app.get('/delete-account', (_req, res, next) => {
      res.set('Cache-Control', cacheControl(join(root, 'delete-account.html'), root)).sendFile('delete-account.html', { root }, err => void (err && next()));
    });
    app.use(express.static(root, { index: false, setHeaders: (res, file) => void res.setHeader('Cache-Control', cacheControl(file, root)) }));
    // A page route (no file extension) gets the app, which draws it. A missing file (/assets/old.js) stays a 404, so a
    // stale link never receives HTML where JavaScript was expected. /.well-known has no files, as on GitHub Pages, except assetlinks.json above.
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || extname(req.path) !== '' || req.path.startsWith('/.well-known/')) return next();
      res.set('Cache-Control', NO_CACHE).sendFile('index.html', { root }); // with `root`, so a checkout under a hidden folder (.claude/worktrees/...) still serves the page
    });
  }

  // Last, so it catches what every route above threw (Express 5 passes a rejected async handler here too).
  app.use(errorHandler(recordIssue));

  return app;
}
