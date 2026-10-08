import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { createAuth } from './betterAuth.ts';

// Who is calling, with real cookies through the real API (ADR 004). The Google redirect itself cannot be driven by a test;
// the test-only email and password path runs the same cookie, session and guard code.
let db: Kysely<DB>;
let url: string;
let stop: () => Promise<void>;
let base: string;
let server: Server;
let auth: ReturnType<typeof createAuth>;
const SECRET = randomBytes(32).toString('base64');
const GOOGLE = { clientId: 'test-client.apps.googleusercontent.com', clientSecret: 'test-client-secret' };

beforeAll(async () => {
  ({ db, stop, url } = await startTestDatabase());
  auth = createAuth({ baseURL: 'http://localhost:3999', secret: SECRET, databaseUrl: url, google: GOOGLE, testSignIn: true }, 'test');
  server = createApp({ db, auth }).listen(0);
  await new Promise(done => server.once('listening', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);
afterAll(async () => {
  await new Promise<void>(done => server.close(() => done()));
  await auth.pool.end();
  await stop?.();
});
beforeEach(async () => {
  await db.deleteFrom('users').execute();
  await sql`delete from auth."user"`.execute(db);
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
async function signUp(email: string, name = 'Test User') {
  const res = await post('/api/auth/sign-up/email', { email, password: 'correct horse battery staple', name });
  expect(res.status).toBe(200);
  return (res.headers.getSetCookie().find(c => /session_token=/.test(c)) ?? '').split(';')[0]!;
}
const get = (path: string, headers: Record<string, string> = {}) => fetch(`${base}${path}`, { headers });
const json = async (res: Response) => (await res.json()) as any;
const logSession = (cookie: string, clientId = 'L1', weight = 135) =>
  post('/api/commands/log-session', { clientId, baseVersion: null, input: { exerciseId: 'squat', entry: { d: '2026-10-05', w: weight } } }, { cookie });
const users = async () => (await db.selectFrom('users').select(['id', 'auth_user_id']).orderBy('id').execute());

describe('with no session', () => {
  it.each([['/api/me'], ['/api/sync?since=0']])('GET %s is 401', async path => {
    const res = await get(path);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'sign-in required' });
  });

  it('a command is 401 and writes nothing', async () => {
    expect((await logSession('')).status).toBe(401);
    expect(await db.selectFrom('log_entries').selectAll().execute()).toEqual([]);
    expect(await users()).toEqual([]);
  });

  it('the health checks and the auth routes stay open', async () => {
    expect((await get('/api/health')).status).toBe(200);
    expect((await get('/api/auth/get-session')).status).toBe(200);
  });
});

describe('with a session', () => {
  it('/api/me says who it is, and our own user row is made on the first request and reused after', async () => {
    const cookie = await signUp('a@example.com', 'Ada');
    const first = await json(await get('/api/me', { cookie }));
    expect(first).toMatchObject({ ok: true, account: { kind: 'session', email: 'a@example.com', name: 'Ada' } });
    const second = await json(await get('/api/me', { cookie }));
    expect(second.userId).toBe(first.userId);
    const rows = await users();
    expect(rows).toHaveLength(1);
    // the single link to Better Auth is its user id, in one column (FM-19)
    const authId = (await sql<{ id: string }>`select id from auth."user"`.execute(db)).rows[0]!.id;
    expect(rows[0]!.auth_user_id).toBe(authId);
  });

  it('commands and the pull work with the cookie, and the data is the signed-in user\'s', async () => {
    const cookie = await signUp('a@example.com');
    expect((await logSession(cookie)).status).toBe(201);
    const page = await json(await get('/api/sync?since=0', { cookie }));
    expect(page.rows.map((r: { client_id: string }) => r.client_id)).toEqual(['L1']);
    const me = await json(await get('/api/me', { cookie }));
    expect((await db.selectFrom('log_entries').select('user_id').executeTakeFirstOrThrow()).user_id).toBe(me.userId);
  });

  it('two signed-in users never see each other\'s rows, and cannot change them', async () => {
    const ann = await signUp('ann@example.com');
    const bob = await signUp('bob@example.com');
    await logSession(ann, 'ann-1', 100);
    await logSession(bob, 'bob-1', 200);
    const annSees = await json(await get('/api/sync?since=0', { cookie: ann }));
    const bobSees = await json(await get('/api/sync?since=0', { cookie: bob }));
    expect(annSees.rows.map((r: { client_id: string }) => r.client_id)).toEqual(['ann-1']);
    expect(bobSees.rows.map((r: { client_id: string }) => r.client_id)).toEqual(['bob-1']);
    // bob names ann's entry: it is simply not there for him
    const res = await post('/api/commands/delete-entry', { clientId: 'x', baseVersion: 1, input: { entryId: 'ann-1' } }, { cookie: bob });
    expect(res.status).toBe(409);
    expect((await db.selectFrom('log_entries').select('deleted_at').where('client_id', '=', 'ann-1').executeTakeFirstOrThrow()).deleted_at).toBeNull();
    expect(await users()).toHaveLength(2);
  });

  it('a second sign-in for the same account is the same user', async () => {
    const first = await signUp('a@example.com');
    const second = (await post('/api/auth/sign-in/email', { email: 'a@example.com', password: 'correct horse battery staple' })).headers.getSetCookie().find(c => /session_token=/.test(c))!.split(';')[0]!;
    expect((await json(await get('/api/me', { cookie: first }))).userId).toBe((await json(await get('/api/me', { cookie: second }))).userId);
    expect(await users()).toHaveLength(1);
  });

  it('many first requests at once still make exactly one user row', async () => {
    const cookie = await signUp('a@example.com');
    await Promise.all(Array.from({ length: 8 }, () => get('/api/me', { cookie })));
    expect(await users()).toHaveLength(1);
  });
});

describe('a cookie that is not good', () => {
  it.each([
    ['one that was never issued', 'better-auth.session_token=forged.value'],
    ['one with the wrong signature', 'better-auth.session_token=abc.def'],
    ['gibberish', 'better-auth.session_token=%%%'],
  ])('%s is 401, not a crash', async (_name, cookie) => {
    const res = await get('/api/me', { cookie });
    expect(res.status).toBe(401);
  });

  it('after signing out, the old cookie is 401', async () => {
    const cookie = await signUp('a@example.com');
    expect((await get('/api/me', { cookie })).status).toBe(200);
    await post('/api/auth/sign-out', {}, { cookie });
    expect((await get('/api/me', { cookie })).status).toBe(401);
  });

  it('an expired session is 401', async () => {
    const cookie = await signUp('a@example.com');
    await sql`update auth."session" set "expiresAt" = now() - interval '1 minute'`.execute(db);
    expect((await get('/api/me', { cookie })).status).toBe(401);
  });

  it('a session of a user that was deleted is 401', async () => {
    const cookie = await signUp('a@example.com');
    await sql`delete from auth."user"`.execute(db);
    expect((await get('/api/me', { cookie })).status).toBe(401);
  });
});

describe('the development sign-in next to it', () => {
  it('still works where it is allowed (NODE_ENV is test here), as a dev user', async () => {
    const res = await get('/api/me', { 'x-dev-user': 'owner' });
    expect(await res.json()).toMatchObject({ ok: true, account: { kind: 'dev', email: null, name: 'dev:owner' } });
  });

  it('a session wins over the header when both are sent', async () => {
    const cookie = await signUp('a@example.com');
    const me = await json(await get('/api/me', { cookie, 'x-dev-user': 'owner' }));
    expect(me.account).toMatchObject({ kind: 'session', email: 'a@example.com' });
    expect(await users()).toHaveLength(1); // no dev user was made
  });

  it('is refused when NODE_ENV is production, with or without sign-in configured, and a session still works', async () => {
    const was = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const cookie = await signUp('a@example.com');
      expect((await get('/api/me', { 'x-dev-user': 'owner' })).status).toBe(401);
      expect((await get('/api/sync?since=0', { 'x-dev-user': 'owner' })).status).toBe(401);
      expect((await get('/api/me', { cookie })).status).toBe(200);
      const noAuth = createApp({ db }).listen(0);
      await new Promise(done => noAuth.once('listening', done));
      expect((await fetch(`http://127.0.0.1:${(noAuth.address() as AddressInfo).port}/api/me`, { headers: { 'x-dev-user': 'owner' } })).status).toBe(401);
      await new Promise<void>(done => noAuth.close(() => done()));
      expect(await users()).toHaveLength(1); // only the real user: the header made nobody
    } finally {
      process.env.NODE_ENV = was;
    }
  });
});

describe('when the session cannot be looked up', () => {
  it('is a 503, never a 401: a database problem must not look like being signed out', async () => {
    const broken = createAuth({ baseURL: 'http://localhost:3999', secret: SECRET, databaseUrl: 'postgres://nobody:x@127.0.0.1:1/none', google: GOOGLE }, 'test');
    const app = createApp({ db, auth: broken }).listen(0);
    await new Promise(done => app.once('listening', done));
    try {
      const res = await fetch(`http://127.0.0.1:${(app.address() as AddressInfo).port}/api/me`, { headers: { cookie: 'better-auth.session_token=abc.def' } });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ ok: false, error: 'sign-in unavailable' });
    } finally {
      await new Promise<void>(done => app.close(() => done()));
      await broken.pool.end().catch(() => undefined);
    }
  });
});

describe('the development sign-in page', () => {
  async function page(env: string, withAuth = true) {
    const was = process.env.NODE_ENV;
    process.env.NODE_ENV = env;
    const s = createApp({ db, ...(withAuth ? { auth } : {}) }).listen(0);
    await new Promise(done => s.once('listening', done));
    process.env.NODE_ENV = was;
    try { return await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/dev/auth`); } finally { await new Promise<void>(done => s.close(() => done())); }
  }

  it('is served only in development, and only when sign-in is configured', async () => {
    const res = await page('development');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('/api/auth/sign-in/social');
    expect(html).not.toContain(GOOGLE.clientSecret);
    expect(html).not.toContain(SECRET);
    expect((await page('test')).status).toBe(404);
    expect((await page('production')).status).toBe(404);
    expect((await page('development', false)).status).toBe(404);
  });
});

describe('hardening (B2d)', () => {
  it('refuses a cross-origin write even with a valid cookie, and writes nothing', async () => {
    const cookie = await signUp('csrf@example.com');
    const res = await logSession(cookie).then(() => post('/api/commands/log-session', { clientId: 'X1', baseVersion: null, input: { exerciseId: 'squat', entry: { d: '2026-10-05', w: 225 } } }, { cookie, origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
    const rows = await db.selectFrom('log_entries').select('client_id').execute();
    expect(rows.map(r => r.client_id)).not.toContain('X1');
  });

  it('limits starting a sign-in per client IP but not reading the session', async () => {
    const limited = createApp({ db, auth, trustProxy: 1, authLimits: { signIn: { max: 2, windowMs: 60_000 }, other: { max: 100, windowMs: 60_000 } } }).listen(0);
    await new Promise(done => limited.once('listening', done));
    const url = `http://127.0.0.1:${(limited.address() as AddressInfo).port}`;
    try {
      const signIn = (ip: string) => fetch(`${url}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong password here' }) });
      expect((await signIn('198.51.100.1')).status).not.toBe(429);
      expect((await signIn('198.51.100.1')).status).not.toBe(429);
      const third = await signIn('198.51.100.1');
      expect(third.status).toBe(429);
      expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0);
      expect((await signIn('198.51.100.2')).status).not.toBe(429);
      for (let i = 0; i < 5; i++) expect((await fetch(`${url}/api/auth/get-session`, { headers: { 'x-forwarded-for': '198.51.100.1' } })).status).toBe(200);
    } finally {
      await new Promise<void>(done => limited.close(() => done()));
    }
  });

  it('marks the session cookie Secure when the API is served over https', async () => {
    const secure = createAuth({ baseURL: 'https://iron.example', secret: SECRET, databaseUrl: url, google: GOOGLE, testSignIn: true }, 'test');
    const s = createApp({ db, auth: secure, allowedOrigins: ['https://iron.example'] }).listen(0);
    await new Promise(done => s.once('listening', done));
    try {
      const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/api/auth/sign-up/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://iron.example' }, body: JSON.stringify({ email: 'secure@example.com', password: 'correct horse battery staple', name: 'S' }) });
      expect(res.status).toBe(200);
      const cookie = res.headers.getSetCookie().find(c => /session_token=/.test(c))!;
      expect(cookie).toMatch(/;\s*Secure/i);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
    } finally {
      await new Promise<void>(done => s.close(() => done()));
      await secure.pool.end();
    }
  });
});
