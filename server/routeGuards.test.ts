import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { createAuth } from './auth/betterAuth.ts';
import type { DB } from './db/types.ts';
import { ADMIN_ONLY } from './billing.ts';
import { startTestDatabase } from './test/postgres.ts';

// The route inventory (global rule endpoint-guards.md): every route createApp registers is either on PUBLIC below, with a reason, or
// answers 401 to a caller with no session. A route added above the sign-in gate by mistake, or left off this list, fails here.

/** The only /api routes that answer without a session. Add a line with its reason; never to make this test pass. */
const PUBLIC: Record<string, string> = {
  'GET /api/health': 'load balancer probe',
  'GET /api/health/db': 'uptime probe; rate-limited, answer cached 5 s',
  'POST /api/client-errors': 'a signed-out phone has errors too; 4 kb, rate-limited, scrubbed',
  'POST /api/stripe/webhook': 'Stripe calls it; the signature is the check',
};

/** Public only when sign-in is configured (`if (auth)` in createApp). */
const PUBLIC_WITH_AUTH: Record<string, string> = {
  'GET /api/auth-options': 'what the sign-in screen may offer; names no address or secret',
  'ANY /api/auth/*splat': 'Better Auth is the sign-in itself; own limits and body cap',
};

// Not covered here: POST /api/push/fire, registered only when push.fire is configured. It is public by design (a Google-signed token is
// its check, push/fire.ts) and its token and limit tests live in the push tests.

/** Mounted routers (app.use with a prefix) cannot be listed from the router, so each prefix is probed by hand. */
const PREFIXES = ['account', 'backups', 'billing', 'catalog', 'commands', 'foods', 'issues', 'me', 'push', 'sync'];

let db: Kysely<DB>;
let auth: ReturnType<typeof createAuth>;
let qaUrl: string;
let stop: () => Promise<void>;
let server: Server | undefined;
beforeAll(async () => {
  let dbUrl: string;
  ({ db, stop, url: dbUrl } = await startTestDatabase());
  qaUrl = dbUrl;
  auth = createAuth({ baseURL: 'http://localhost:3999', secret: randomBytes(32).toString('base64'), databaseUrl: dbUrl, google: { clientId: 'test-client.apps.googleusercontent.com', clientSecret: 'test-client-secret' }, testSignIn: true }, 'test');
}, 120_000);
afterEach(() => new Promise<void>(done => (server ? server.close(() => done()) : done())));
afterAll(async () => { await stop?.(); });

const listen = async (app: ReturnType<typeof createApp>) => {
  server = app.listen(0);
  await new Promise(done => server!.once('listening', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

interface Layer { route?: { path: string; methods: Record<string, boolean> } }
// app.all registers one route for every verb; it is listed once as ANY.
const directRoutes = (app: ReturnType<typeof createApp>): string[] =>
  ((app as unknown as { router: { stack: Layer[] } }).router.stack)
    .flatMap(l => {
      if (!l.route) return [];
      const methods = Object.keys(l.route.methods);
      return methods.length > 5 ? [`ANY ${l.route.path}`] : methods.map(m => `${m.toUpperCase()} ${l.route!.path}`);
    })
    .filter(r => r.split(' ')[1]!.startsWith('/api'));

describe('route inventory', () => {
  it.each([['without sign-in configured', false], ['with sign-in configured', true]])('every direct /api route is public on purpose or needs a session, %s', async (_name, withAuth) => {
    const app = createApp(withAuth ? { db, auth } : { db });
    const url = await listen(app);
    const routes = directRoutes(app);
    const allowed: Record<string, string> = withAuth ? { ...PUBLIC, ...PUBLIC_WITH_AUTH } : PUBLIC;
    expect(routes.length).toBeGreaterThan(20); // the walk found the routes at all
    for (const route of routes.filter(r => !(r in allowed))) {
      const [method, path] = route.split(' ') as [string, string];
      const res = await fetch(url + path, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
      expect(res.status, `${route} answered ${res.status} with no session; add a guard, or list it in PUBLIC with a reason`).toBe(401);
    }
  });

  it('the public list has no stale entries', () => {
    const routes = directRoutes(createApp({ db, auth }));
    for (const route of Object.keys({ ...PUBLIC, ...PUBLIC_WITH_AUTH })) expect(routes, `${route} is on PUBLIC but not registered`).toContain(route);
  });

  it('every mounted prefix, and any unknown /api path, needs a session', async () => {
    const url = await listen(createApp({ db }));
    for (const prefix of [...PREFIXES, 'no-such-thing']) {
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        const res = await fetch(`${url}/api/${prefix}/x`, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
        expect(res.status, `${method} /api/${prefix}/x`).toBe(401);
      }
    }
  });
});

describe('QA persona routes (list, switch, reset, return) under /api/auth/qa/personas', () => {
  const probes: [string, string][] = [['GET', ''], ['POST', '/switch'], ['POST', '/reset'], ['POST', '/return']];
  const hit = async (url: string, method: string, path: string) => (await fetch(`${url}/api/auth/qa/personas${path}`, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : '{}' })).status;

  it('answer 404 where QA is off (production and staging)', async () => {
    const url = await listen(createApp({ db, auth }));
    for (const [method, path] of probes) expect(await hit(url, method, path), `${method} ${path}`).toBe(404);
  });

  it('need a session where QA is on and the database is marked', async () => {
    await sql`do $$ begin execute format('comment on database %I is %L', current_database(), 'iron-log qa'); end $$`.execute(db);
    const qa = createAuth({ baseURL: 'http://localhost:3999', secret: randomBytes(32).toString('base64'), databaseUrl: qaUrl, google: { clientId: 'test-client.apps.googleusercontent.com', clientSecret: 'test-client-secret' }, testSignIn: true, qaPersonas: true }, 'test');
    try {
      const url = await listen(createApp({ db, auth: qa }));
      for (const [method, path] of probes) expect(await hit(url, method, path), `${method} ${path}`).toBe(401);
    } finally {
      await qa.pool.end();
      await sql`do $$ begin execute format('comment on database %I is %L', current_database(), null); end $$`.execute(db);
    }
  });
});

describe('role guards: a plain signed-in account', () => {
  const plain = { 'x-dev-user': 'plain' };
  it('is refused the admin and paid routes', async () => {
    const url = await listen(createApp({ db }));
    expect((await fetch(`${url}/api/issues`, { headers: plain })).status).toBe(403);
    expect((await fetch(`${url}/api/backups`, { headers: { ...plain, 'x-client-version': 'dev' } })).status).toBe(402);
    if (ADMIN_ONLY) expect((await fetch(`${url}/api/billing/checkout`, { method: 'POST', headers: { ...plain, 'content-type': 'application/json' }, body: '{}' })).status).toBe(403);
  });
  it('is let through to the routes every account has', async () => {
    const url = await listen(createApp({ db }));
    expect((await fetch(`${url}/api/me`, { headers: plain })).status).toBe(200);
  });
});

describe('Cache-Control on /api', () => {
  it('signed-in answers, refusals and unknown paths are never stored', async () => {
    const url = await listen(createApp({ db }));
    const cc = async (path: string, headers: Record<string, string> = {}) => (await fetch(url + path, { headers })).headers.get('cache-control');
    expect(await cc('/api/me', { 'x-dev-user': 'plain' })).toBe('private, no-store');
    expect(await cc('/api/sync?since=0', { 'x-dev-user': 'plain' })).toBe('private, no-store');
    expect(await cc('/api/me')).toBe('private, no-store'); // the 401
    expect(await cc('/api/no-such-thing')).toBe('private, no-store');
  });
  it('Better Auth answers (get-session carries the account email and name) are never stored either', async () => {
    const url = await listen(createApp({ db, auth }));
    const cc = async (path: string) => (await fetch(url + path)).headers.get('cache-control');
    expect(await cc('/api/auth/get-session')).toMatch(/no-store/); // Better Auth sets its own header
    expect(await cc('/api/auth-options')).toBe('private, no-store');
  });
});
