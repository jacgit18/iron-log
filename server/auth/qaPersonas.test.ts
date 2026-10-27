import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import type { DB } from '../db/types.ts';
import { PERSONAS, personaAuthId, personaEmail } from '../qa/personas.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { createAuth, type AuthConfig } from './betterAuth.ts';
import { QA_MARK } from './qaPersonas.ts';

// The QA test accounts (brief: qa-persona-picker). Real routes, real cookies and sessions, a throwaway Postgres.
let db: Kysely<DB>;
let url: string;
let stop: () => Promise<void>;
const SECRET = randomBytes(32).toString('base64');
const GOOGLE = { clientId: 'test-client.apps.googleusercontent.com', clientSecret: 'test-client-secret' };
const BASE = 'http://localhost:3999';
const ADMIN = 'admin@example.com';
const PASSWORD = 'correct horse battery staple';

const running: { close: () => Promise<void> }[] = [];
async function serve(over: Partial<AuthConfig> = {}) {
  const auth = createAuth({ baseURL: BASE, secret: SECRET, databaseUrl: url, google: GOOGLE, testSignIn: true, capExempt: new Set([ADMIN]), qaPersonas: true, ...over }, 'test');
  const server: Server = createApp({ db, auth }).listen(0);
  await new Promise(done => server.once('listening', done));
  running.push({ close: async () => { await new Promise<void>(done => server.close(() => done())); await auth.pool.end(); } });
  return { auth, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}
const mark = (value: string | null) => db.executeQuery(sql`do $$ begin execute format('comment on database %I is %L', current_database(), ${sql.lit(value)}); end $$`.compile(db));

beforeAll(async () => { ({ db, stop, url } = await startTestDatabase()); }, 120_000);
afterAll(async () => { await Promise.all(running.map(r => r.close())); await stop?.(); });
beforeEach(async () => {
  await db.deleteFrom('users').execute();
  await sql`delete from auth."user"`.execute(db);
  await mark(QA_MARK);
});

/** A tiny cookie jar: name=value pairs from Set-Cookie, sent back as one header. */
class Jar {
  private c = new Map<string, string>();
  take(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const [name, ...v] = pair!.split('=');
      const value = v.join('=');
      if (value === '' || attrs.some(a => /max-age=0/i.test(a))) this.c.delete(name!.trim()); else this.c.set(name!.trim(), value);
    }
    return res;
  }
  has(part: string) { return [...this.c.keys()].some(k => k.includes(part)); }
  get header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join('; '); }
}
const call = async (base: string, jar: Jar, method: string, path: string, body?: unknown) =>
  jar.take(await fetch(`${base}/api/auth${path}`, { method, headers: { 'content-type': 'application/json', cookie: jar.header }, body: body === undefined ? undefined : JSON.stringify(body) }));
const signUp = async (base: string, email: string, verified = true) => {
  const jar = new Jar();
  expect((await call(base, jar, 'POST', '/sign-up/email', { email, password: PASSWORD, name: 'Someone' })).status).toBe(200);
  await sql`update auth."user" set "emailVerified" = ${verified} where email = ${email}`.execute(db);
  return jar;
};
const seedPersona = async (id: string) => {
  await sql`insert into auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values (${personaAuthId(id)}, ${id}, ${personaEmail(id)}, true, now(), now())`.execute(db);
};
const me = async (base: string, jar: Jar) => ((await (await call(base, jar, 'GET', '/get-session')).json()) as { user?: { email: string } } | null)?.user?.email ?? null;

describe('the environment locks', () => {
  it('answers 404 on a database without the QA mark, even to an admin, and does not list personas as on', async () => {
    await mark(null);
    const { base } = await serve();
    const jar = await signUp(base, ADMIN);
    expect((await call(base, jar, 'GET', '/qa/personas')).status).toBe(404);
    expect((await call(base, jar, 'POST', '/qa/personas/switch', { id: 'new-user' })).status).toBe(404);
    expect((await call(base, jar, 'POST', '/qa/personas/return')).status).toBe(404);
    expect(((await (await fetch(`${base}/api/auth-options`)).json()) as { qaPersonas: boolean }).qaPersonas).toBe(false);
  });

  it('has no such routes when the setting is off, even on a marked database', async () => {
    const { base } = await serve({ qaPersonas: false });
    const jar = await signUp(base, ADMIN);
    expect((await call(base, jar, 'GET', '/qa/personas')).status).toBe(404);
    expect((await call(base, jar, 'POST', '/qa/personas/switch', { id: 'new-user' })).status).toBe(404);
    expect(((await (await fetch(`${base}/api/auth-options`)).json()) as { qaPersonas: boolean }).qaPersonas).toBe(false);
  });

  it('says the personas exist only when the setting is on and the database is marked', async () => {
    const { base } = await serve();
    expect(((await (await fetch(`${base}/api/auth-options`)).json()) as { qaPersonas: boolean }).qaPersonas).toBe(true);
  });
});

describe('who may switch', () => {
  it('refuses a visitor with no session, a signed-in non-admin, and an admin address that is not verified', async () => {
    const { base } = await serve();
    await seedPersona('new-user');
    expect((await call(base, new Jar(), 'POST', '/qa/personas/switch', { id: 'new-user' })).status).toBe(401);
    const stranger = await signUp(base, 'stranger@example.com');
    expect((await call(base, stranger, 'GET', '/qa/personas')).status).toBe(403);
    const switched = await call(base, stranger, 'POST', '/qa/personas/switch', { id: 'new-user' });
    expect(switched.status).toBe(403);
    expect(stranger.has('admin_session')).toBe(false);
    expect(await me(base, stranger)).toBe('stranger@example.com');
    const unverified = await signUp(base, ADMIN, false);
    expect((await call(base, unverified, 'POST', '/qa/personas/switch', { id: 'new-user' })).status).toBe(403);
  });

  it('refuses an id outside the list, including another account\'s id, and a missing seed', async () => {
    const { base } = await serve();
    const jar = await signUp(base, ADMIN);
    const [{ id: adminId }] = (await sql<{ id: string }>`select id from auth."user" where email = ${ADMIN}`.execute(db)).rows as [{ id: string }];
    for (const id of [adminId, 'admin', '', 5, null, undefined]) expect((await call(base, jar, 'POST', '/qa/personas/switch', { id })).status).toBe(400);
    expect((await call(base, jar, 'POST', '/qa/personas/switch', { id: 'new-user' })).status).toBe(404); // in the list but never seeded
    expect(await me(base, jar)).toBe(ADMIN);
  });
});

describe('switching and returning', () => {
  it('lists every persona to an admin, with no email, and switches to one and back', async () => {
    const { base } = await serve();
    await seedPersona('paid-past-due');
    const jar = await signUp(base, ADMIN);
    const list = (await (await call(base, jar, 'GET', '/qa/personas')).json()) as { personas: Record<string, unknown>[]; current: string | null };
    expect(list.personas).toHaveLength(PERSONAS.length);
    expect(list.current).toBeNull();
    expect(JSON.stringify(list)).not.toContain('qa.invalid');

    expect((await call(base, jar, 'POST', '/qa/personas/switch', { id: 'paid-past-due' })).status).toBe(200);
    expect(jar.has('admin_session')).toBe(true);
    expect(await me(base, jar)).toBe(personaEmail('paid-past-due'));
    expect(((await (await call(base, jar, 'GET', '/qa/personas')).json()) as { current: string }).current).toBe('paid-past-due');

    expect((await call(base, jar, 'POST', '/qa/personas/return')).status).toBe(200);
    expect(jar.has('admin_session')).toBe(false);
    expect(await me(base, jar)).toBe(ADMIN);
  });

  it('gives the test account a session of about an hour, not 30 days', async () => {
    const { base } = await serve();
    await seedPersona('lifetime');
    const jar = await signUp(base, ADMIN);
    await call(base, jar, 'POST', '/qa/personas/switch', { id: 'lifetime' });
    const { rows } = await sql<{ secs: number }>`select extract(epoch from ("expiresAt" - now()))::int as secs from auth."session" where "userId" = ${personaAuthId('lifetime')}`.execute(db);
    expect(rows[0]!.secs).toBeLessThanOrEqual(3600);
    expect(rows[0]!.secs).toBeGreaterThan(3000);
  });

  it('does not let a test account switch to another, or return without having switched', async () => {
    const { base } = await serve();
    await seedPersona('founder');
    await seedPersona('lifetime');
    const jar = await signUp(base, ADMIN);
    expect((await call(base, jar, 'POST', '/qa/personas/return')).status).toBe(400); // an admin who has not switched
    await call(base, jar, 'POST', '/qa/personas/switch', { id: 'founder' });
    expect((await call(base, jar, 'POST', '/qa/personas/switch', { id: 'lifetime' })).status).toBe(403);
    expect(await me(base, jar)).toBe(personaEmail('founder'));
  });

  it('ignores a forged way back: a test-account session with someone else\'s cookie cannot return', async () => {
    const { base } = await serve();
    await seedPersona('founder');
    const jar = await signUp(base, ADMIN);
    await call(base, jar, 'POST', '/qa/personas/switch', { id: 'founder' });
    const forged = new Jar();
    (forged as unknown as { c: Map<string, string> }).c = new Map([...(jar as unknown as { c: Map<string, string> }).c].map(([k, v]) => [k, k.includes('admin_session') ? 'forged.value' : v]));
    expect((await call(base, forged, 'POST', '/qa/personas/return')).status).toBe(400);
    expect(await me(base, forged)).toBe(personaEmail('founder'));
  });
});
