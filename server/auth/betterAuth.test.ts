import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { authConfigFrom, createAuth, SESSION_DAYS, type AuthConfig } from './betterAuth.ts';

let db: Kysely<DB>;
let url: string;
let stop: () => Promise<void>;
const SECRET = randomBytes(32).toString('base64');
const GOOGLE = { clientId: 'test-client.apps.googleusercontent.com', clientSecret: 'test-client-secret' };
const BASE = 'http://localhost:3999';

const running: { server: Server; close: () => Promise<void> }[] = [];
async function serve(over: Partial<AuthConfig> = {}, env = 'test') {
  const auth = createAuth({ baseURL: BASE, secret: SECRET, databaseUrl: url, google: GOOGLE, testSignIn: true, ...over }, env);
  const server = createApp({ db, auth }).listen(0);
  await new Promise(done => server.once('listening', done));
  const close = async () => { await new Promise<void>(done => server.close(() => done())); await auth.pool.end(); };
  running.push({ server, close });
  return { auth, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

beforeAll(async () => {
  ({ db, stop, url } = await startTestDatabase());
}, 120_000);
afterAll(async () => {
  await Promise.all(running.map(r => r.close()));
  await stop?.();
});
beforeEach(async () => {
  const { sql } = await import('kysely');
  await db.deleteFrom('users').execute();
  await sql`delete from auth."user"`.execute(db); // sessions and accounts go with it
});

const post = (base: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const authRows = async (table: 'user' | 'session' | 'account') => (await (await import('kysely')).sql<{ n: string }>`select count(*) as n from auth.${(await import('kysely')).sql.id(table)}`.execute(db)).rows[0]!.n;
const signUp = (base: string, email = 'a@example.com') => post(base, '/api/auth/sign-up/email', { email, password: 'correct horse battery staple', name: 'Test User' });
const cookieOf = (res: Response) => res.headers.getSetCookie().find(c => /session_token=/.test(c)) ?? '';

describe('the auth schema (migration 008)', () => {
  it('has Better Auth\'s four tables in `auth` and none of them in `public`', async () => {
    const { sql } = await import('kysely');
    const tables = (await sql<{ table_schema: string; table_name: string }>`select table_schema, table_name from information_schema.tables where table_name in ('user', 'session', 'account', 'verification') order by 1, 2`.execute(db)).rows;
    expect(tables).toEqual(['account', 'session', 'user', 'verification'].map(t => ({ table_schema: 'auth', table_name: t })));
  });
});

describe('signing in with Google', () => {
  it('starts the redirect to Google with our client id, our callback, a state and the identity scopes', async () => {
    const { base } = await serve();
    const res = await post(base, '/api/auth/sign-in/social', { provider: 'google', callbackURL: '/' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; redirect: boolean };
    expect(body.redirect).toBe(true);
    const google = new URL(body.url);
    expect(google.origin + google.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(google.searchParams.get('client_id')).toBe(GOOGLE.clientId);
    expect(google.searchParams.get('redirect_uri')).toBe(`${BASE}/api/auth/callback/google`);
    expect(google.searchParams.get('response_type')).toBe('code');
    expect(google.searchParams.get('state')).toBeTruthy();
    expect(google.searchParams.get('scope')).toMatch(/openid/);
    expect(google.searchParams.get('scope')).toMatch(/email/);
    expect(google.searchParams.get('code_challenge')).toBeTruthy(); // PKCE
  });

  it('does not put the client secret anywhere in what the browser is sent', async () => {
    const { base } = await serve();
    const res = await post(base, '/api/auth/sign-in/social', { provider: 'google', callbackURL: '/' });
    expect(JSON.stringify([await res.text(), [...res.headers]])).not.toContain(GOOGLE.clientSecret);
  });

  it('refuses a callback with no state, and creates no user', async () => {
    const { base } = await serve();
    const res = await fetch(`${base}/api/auth/callback/google?code=abc`, { redirect: 'manual' });
    expect([302, 400, 401, 403]).toContain(res.status);
    expect(await authRows('user')).toBe('0');
  });

  it('keeps Google\'s tokens encrypted, not in the clear', async () => {
    const { auth } = await serve();
    expect(auth.options.account?.encryptOAuthTokens).toBe(true);
  });
});

describe('the session (through the test-only email and password path, which runs the real cookie and session code)', () => {
  it('signing up sets a session cookie: HttpOnly, SameSite=Lax, whole site, about 30 days, not Secure over http', async () => {
    const { base } = await serve();
    const res = await signUp(base);
    expect(res.status).toBe(200);
    const cookie = cookieOf(res);
    expect(cookie).toMatch(/^better-auth\.session_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).not.toMatch(/;\s*Secure/i);
    const maxAge = Number(/Max-Age=(\d+)/i.exec(cookie)?.[1]);
    expect(maxAge).toBe(SESSION_DAYS * 24 * 60 * 60);
  });

  it('is Secure, with the __Secure- prefix, when the API is served over https', async () => {
    const { base } = await serve({ baseURL: 'https://iron-log.example.run.app' });
    const cookie = cookieOf(await signUp(base, 'secure@example.com'));
    expect(cookie).toMatch(/^__Secure-better-auth\.session_token=/);
    expect(cookie).toMatch(/;\s*Secure/i);
  });

  it('get-session returns the user for the cookie, and nothing without it', async () => {
    const { base } = await serve();
    const cookie = cookieOf(await signUp(base));
    const me = await (await fetch(`${base}/api/auth/get-session`, { headers: { cookie: cookie.split(';')[0]! } })).json();
    expect(me).toMatchObject({ user: { email: 'a@example.com', name: 'Test User' }, session: { userId: expect.any(String) } });
    expect(await (await fetch(`${base}/api/auth/get-session`)).json()).toBeNull();
    expect(await (await fetch(`${base}/api/auth/get-session`, { headers: { cookie: 'better-auth.session_token=forged.value' } })).json()).toBeNull();
  });

  it('keeps the session in the database for 30 days', async () => {
    const { base } = await serve();
    await signUp(base);
    const { sql } = await import('kysely');
    const row = (await sql<{ days: number }>`select extract(epoch from ("expiresAt" - "createdAt")) / 86400 as days from auth."session"`.execute(db)).rows[0]!;
    expect(Math.round(row.days)).toBe(SESSION_DAYS);
  });

  it('signing out deletes the session row, and the old cookie stops working', async () => {
    const { base } = await serve();
    const cookie = cookieOf(await signUp(base)).split(';')[0]!;
    expect(await authRows('session')).toBe('1');
    expect((await post(base, '/api/auth/sign-out', {}, { cookie })).status).toBe(200);
    expect(await authRows('session')).toBe('0');
    expect(await (await fetch(`${base}/api/auth/get-session`, { headers: { cookie } })).json()).toBeNull();
  });

  it('two sign-ins are two sessions', async () => {
    const { base } = await serve();
    await signUp(base);
    await post(base, '/api/auth/sign-in/email', { email: 'a@example.com', password: 'correct horse battery staple' });
    expect(await authRows('session')).toBe('2');
  });
});

describe('email and password is not available outside tests', () => {
  it('is switched off by default: registering is refused and creates nothing', async () => {
    const { base } = await serve({ testSignIn: false });
    const res = await signUp(base);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await authRows('user')).toBe('0');
    expect((await post(base, '/api/auth/sign-in/email', { email: 'a@example.com', password: 'x' })).status).toBeGreaterThanOrEqual(400);
  });

  it('cannot be switched on when the environment is production, or empty', () => {
    const config = { baseURL: BASE, secret: SECRET, databaseUrl: url, google: GOOGLE, testSignIn: true };
    expect(() => createAuth(config, 'production')).toThrow(/tests only/);
    expect(() => createAuth(config, '')).toThrow(/tests only/);
    for (const env of ['development', 'test']) {
      const a = createAuth(config, env);
      void a.pool.end();
    }
  });
});

describe('the API around it', () => {
  it('the auth routes are served before the JSON parser, and the rest of the API is untouched', async () => {
    const { base } = await serve();
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
    expect((await fetch(`${base}/api/auth/ok`)).status).toBe(200);
  });

  it('an app without sign-in configured has no /api/auth routes at all', async () => {
    const server = createApp({ db }).listen(0);
    await new Promise(done => server.once('listening', done));
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth/get-session`);
    expect(res.status).not.toBe(200);
    await new Promise<void>(done => server.close(() => done()));
  });
});

describe('authConfigFrom', () => {
  const good = { BETTER_AUTH_SECRET: SECRET, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', BASE_URL: 'https://iron-log.example.run.app', DATABASE_URL: 'postgres://u:p@h/d' };

  it('is on when everything is set, with the base URL reduced to its origin', () => {
    const out = authConfigFrom({ ...good, BASE_URL: 'https://iron-log.example.run.app/' });
    expect(out).toMatchObject({ enabled: true, config: { baseURL: 'https://iron-log.example.run.app', testSignIn: false } });
  });

  it('is off, and says why, for each missing piece', () => {
    for (const name of ['BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'BASE_URL', 'DATABASE_URL']) {
      const env = { ...good, [name]: '' };
      expect(authConfigFrom(env), name).toEqual({ enabled: false, reasons: [`${name} is not set`] });
    }
  });

  it('never prints a secret in its reasons', () => {
    const out = authConfigFrom({ ...good, BETTER_AUTH_SECRET: 'short-secret-value' });
    expect(out).toEqual({ enabled: false, reasons: ['BETTER_AUTH_SECRET is shorter than 32 characters'] });
    expect(JSON.stringify(out)).not.toContain('short-secret-value');
  });

  it.each([
    ['not a URL', 'localhost:3002', 'BASE_URL must start with http:// or https://'],
    ['gibberish', '::::', 'BASE_URL is not a valid URL'],
    ['a path', 'https://x.example/app', 'BASE_URL must be an origin only, with no path'],
  ])('refuses a base URL that is %s', (_name, BASE_URL, reason) => {
    expect(authConfigFrom({ ...good, BASE_URL })).toEqual({ enabled: false, reasons: [reason] });
  });

  it('allows http for local development but not in production', () => {
    expect(authConfigFrom({ ...good, BASE_URL: 'http://localhost:3002' }).enabled).toBe(true);
    expect(authConfigFrom({ ...good, BASE_URL: 'http://localhost:3002', NODE_ENV: 'production' })).toEqual({ enabled: false, reasons: ['BASE_URL must be https in production'] });
  });

  it('turns the test-only sign-in on only when asked', () => {
    expect(authConfigFrom({ ...good, AUTH_TEST_SIGNIN: 'true' })).toMatchObject({ enabled: true, config: { testSignIn: true } });
    expect(authConfigFrom({ ...good, AUTH_TEST_SIGNIN: 'yes' })).toMatchObject({ enabled: true, config: { testSignIn: false } });
  });
});
