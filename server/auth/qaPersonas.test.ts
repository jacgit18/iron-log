import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.ts';
import type { DB } from '../db/types.ts';
import { PERSONAS, personaAuthId, personaById, personaEmail } from '../qa/personas.ts';
import { scenariosForPersona } from '../qa/scenarios.ts';
import { SEED_EXERCISE_IDS } from '../qa/seedPersona.ts';
import { buildPersonaRows } from '../qa/seedPlan.ts';
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
const ownerPools: pg.Pool[] = [];
async function serve(over: Partial<AuthConfig> = {}) {
  const auth = createAuth({ baseURL: BASE, secret: SECRET, databaseUrl: url, google: GOOGLE, testSignIn: true, capExempt: new Set([ADMIN]), qaPersonas: true, ...over }, 'test');
  const server: Server = createApp({ db, auth, admins: new Set([ADMIN]) }).listen(0); // production passes the same ADMIN_EMAILS list to both
  await new Promise(done => server.once('listening', done));
  running.push({ close: async () => { await new Promise<void>(done => server.close(() => done())); await auth.pool.end(); } });
  return { auth, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}
const mark = (value: string | null) => db.executeQuery(sql`do $$ begin execute format('comment on database %I is %L', current_database(), ${sql.lit(value)}); end $$`.compile(db));

beforeAll(async () => { ({ db, stop, url } = await startTestDatabase()); }, 120_000);
afterAll(async () => { await Promise.all(running.map(r => r.close())); await Promise.all(ownerPools.map(p => p.end())); await stop?.(); });
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

describe('what /api/me says (the banner and the Settings panel read it)', () => {
  const meOf = async (base: string, jar: Jar) => (await (await fetch(`${base}/api/me`, { headers: { cookie: jar.header } })).json()) as { qa?: { persona: string | null; canSwitch: boolean } };

  it('says an admin may switch, then which test account they are, with no right to switch from inside it', async () => {
    const { base } = await serve();
    await seedPersona('paid-past-due');
    const jar = await signUp(base, ADMIN);
    expect((await meOf(base, jar)).qa).toEqual({ persona: null, canSwitch: true });
    await call(base, jar, 'POST', '/qa/personas/switch', { id: 'paid-past-due' });
    expect((await meOf(base, jar)).qa).toEqual({ persona: 'Paid, past due', canSwitch: false });
    await call(base, jar, 'POST', '/qa/personas/return');
    expect((await meOf(base, jar)).qa).toEqual({ persona: null, canSwitch: true });
  });

  it('says a signed-in non-admin may not switch', async () => {
    const { base } = await serve();
    const stranger = await signUp(base, 'stranger@example.com');
    expect((await meOf(base, stranger)).qa).toEqual({ persona: null, canSwitch: false });
  });

  it('has no qa key at all without the QA mark or with the setting off (production\'s answer is unchanged)', async () => {
    const off = await serve({ qaPersonas: false });
    const jar = await signUp(off.base, ADMIN);
    expect('qa' in (await meOf(off.base, jar))).toBe(false);
    await mark(null);
    const unmarked = await serve();
    expect('qa' in (await meOf(unmarked.base, jar))).toBe(false);
  });
});

describe('switching and returning', () => {
  it('lists every persona to an admin, with no email, and switches to one and back', async () => {
    const { base } = await serve();
    await seedPersona('paid-past-due');
    const jar = await signUp(base, ADMIN);
    const list = (await (await call(base, jar, 'GET', '/qa/personas')).json()) as { personas: Record<string, unknown>[]; current: string | null; canReset: boolean };
    expect(list.personas).toHaveLength(PERSONAS.length);
    expect(list.current).toBeNull();
    expect(list.personas.find(p => p.id === 'paid-past-due')!.seeded).toBe(true);
    expect(list.personas.find(p => p.id === 'founder')!.seeded).toBe(false);
    expect(JSON.stringify(list)).not.toContain('qa.invalid');
    // Each account carries the scenarios that run as it (brief: qa-scenarios): ids and titles only, not the steps.
    const tagged = list.personas.find(p => p.id === 'meal-planner') as { scenarios: { id: string; title: string }[] };
    expect(tagged.scenarios.map(s => s.id)).toEqual(scenariosForPersona('meal-planner').map(s => s.id));
    expect(Object.keys(tagged.scenarios[0]!).sort()).toEqual(['id', 'title']);
    expect((list.personas.find(p => p.id === 'legacy-beta') as { scenarios: unknown[] }).scenarios).toEqual([]);

    expect((await call(base, jar, 'POST', '/qa/personas/switch', { id: 'paid-past-due' })).status).toBe(200);
    expect(jar.has('admin_session')).toBe(true);
    expect(await me(base, jar)).toBe(personaEmail('paid-past-due'));
    expect(((await (await call(base, jar, 'GET', '/qa/personas')).json()) as { current: string }).current).toBe('paid-past-due');

    expect((await call(base, jar, 'POST', '/qa/personas/return')).status).toBe(200);
    expect(jar.has('admin_session')).toBe(false);
    expect(await me(base, jar)).toBe(ADMIN);
  });

  it('puts the admin\'s own session back as the usual long-lived cookie, with no "don\'t remember" left over (code review, 2026-10-27)', async () => {
    const { base } = await serve();
    await seedPersona('lifetime');
    const jar = await signUp(base, ADMIN);
    await call(base, jar, 'POST', '/qa/personas/switch', { id: 'lifetime' });
    const res = await call(base, jar, 'POST', '/qa/personas/return');
    const set = res.headers.getSetCookie();
    const session = set.find(c => /session_token=/.test(c))!;
    expect(session).toMatch(/Max-Age=\d{6,}/i); // about 30 days, not a browser-session cookie
    expect(set.some(c => /dont_remember=true/.test(c))).toBe(false);
    expect(jar.has('dont_remember')).toBe(false);
  });

  it('does not show the list to a non-admin who copies a signed cookie into admin_session (code review, 2026-10-27)', async () => {
    const { base } = await serve();
    const stranger = await signUp(base, 'stranger@example.com');
    const own = (stranger as unknown as { c: Map<string, string> }).c;
    const token = [...own].find(([k]) => k.includes('session_token'))![1];
    own.set('better-auth.admin_session', token);
    expect((await call(base, stranger, 'GET', '/qa/personas')).status).toBe(403);
  });

  it('refuses to return to an admin session that has expired (code review, 2026-10-27)', async () => {
    const { base } = await serve();
    await seedPersona('founder');
    const jar = await signUp(base, ADMIN);
    await call(base, jar, 'POST', '/qa/personas/switch', { id: 'founder' });
    await sql`update auth."session" set "expiresAt" = now() - interval '1 minute' where "userId" in (select id from auth."user" where email = ${ADMIN})`.execute(db);
    expect((await call(base, jar, 'POST', '/qa/personas/return')).status).toBe(403);
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

  it('lets a test account switch straight to another, keeps the way back to the admin, and returns to the admin from there', async () => {
    const { base } = await serve();
    await seedPersona('founder');
    await seedPersona('lifetime');
    const jar = await signUp(base, ADMIN);
    expect((await call(base, jar, 'POST', '/qa/personas/return')).status).toBe(400); // an admin who has not switched
    await call(base, jar, 'POST', '/qa/personas/switch', { id: 'founder' });
    expect((await call(base, jar, 'POST', '/qa/personas/switch', { id: 'lifetime' })).status).toBe(200);
    expect(await me(base, jar)).toBe(personaEmail('lifetime'));
    expect(jar.has('admin_session')).toBe(true);
    const { rows } = await sql<{ n: number }>`select count(*)::int as n from auth."session" where "userId" = ${personaAuthId('founder')}`.execute(db);
    expect(rows[0]!.n).toBe(0); // the old test session is gone
    expect((await call(base, jar, 'POST', '/qa/personas/return')).status).toBe(200);
    expect(await me(base, jar)).toBe(ADMIN);
  });

  it('refuses a direct switch from a test account whose kept admin session is gone or expired, and from a stranger', async () => {
    const { base } = await serve();
    await seedPersona('founder');
    await seedPersona('lifetime');
    const jar = await signUp(base, ADMIN);
    await call(base, jar, 'POST', '/qa/personas/switch', { id: 'founder' });
    await sql`update auth."session" set "expiresAt" = now() - interval '1 minute' where "userId" in (select id from auth."user" where email = ${ADMIN})`.execute(db);
    expect((await call(base, jar, 'POST', '/qa/personas/switch', { id: 'lifetime' })).status).toBe(403);
    expect((await call(base, jar, 'POST', '/qa/personas/reset', { id: 'lifetime' })).status).toBe(403);
    expect(await me(base, jar)).toBe(personaEmail('founder'));
    const stranger = await signUp(base, 'stranger@example.com');
    expect((await call(base, stranger, 'POST', '/qa/personas/switch', { id: 'lifetime' })).status).toBe(403);
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

describe('reset (the seed, run in the app on QA)', () => {
  // The test database URL is the owner's, so these run as the owner role: the limits of `ironlog_app` are not exercised here (they are not run).
  const opened: string[] = [];
  const owned = () => (url: string) => { opened.push(url); const pool = new pg.Pool({ connectionString: url, max: 1 }); ownerPools.push(pool); return pool; };
  const counts = async (id: string) => {
    const uid = sql`(select id from users where auth_user_id = ${personaAuthId(id)})`;
    const one = async (table: string, extra = sql``) => (await sql<{ n: number }>`select count(*)::int as n from ${sql.table(table)} where user_id = ${uid} ${extra}`.execute(db)).rows[0]!.n;
    return {
      logs: await one('log_entries'), body: await one('body_entries'), programs: await one('programs'), config: await one('config'),
      diet: await one('list_items', sql`and list = 'diet_entry'`), recipes: await one('list_items', sql`and list = 'recipe'`), grocery: await one('list_items', sql`and list = 'grocery_item'`),
    };
  };
  const expected = (id: string) => {
    const r = buildPersonaRows(personaById(id)!, SEED_EXERCISE_IDS, new Date());
    return { logs: r.logs.length, body: r.body.length, programs: r.programs ? 2 : 0, config: r.config ? 1 : 0, diet: r.dietEntries.length, recipes: r.recipes.length, grocery: r.groceryItems.length };
  };

  it('seeds a persona that was never seeded, and puts a changed one back to a fresh seed\'s row counts', async () => {
    opened.length = 0;
    const { base } = await serve({ qaOwnerDatabaseUrl: url, qaOwnerPool: owned() });
    const jar = await signUp(base, ADMIN);
    for (const id of ['meal-planner', 'recipe-collector', 'diet-on-target']) {
      expect((await call(base, jar, 'POST', '/qa/personas/reset', { id })).status).toBe(200);
      expect(await counts(id)).toEqual(expected(id));
    }
    expect(expected('meal-planner')).toMatchObject({ config: 1, recipes: 4 });
    // Change it, then reset: the extra row is gone, the counts are a fresh seed's again.
    await sql`insert into list_items (user_id, seq, client_id, list, position, data) select id, 9999, 'extra', 'recipe', 99, '{"id":"extra","n":"Extra"}'::jsonb from users where auth_user_id = ${personaAuthId('recipe-collector')}`.execute(db);
    expect((await counts('recipe-collector')).recipes).toBe(31);
    expect((await call(base, jar, 'POST', '/qa/personas/reset', { id: 'recipe-collector' })).status).toBe(200);
    expect(await counts('recipe-collector')).toEqual(expected('recipe-collector'));
    const list = (await (await call(base, jar, 'GET', '/qa/personas')).json()) as { canReset: boolean; personas: { id: string; seeded: boolean }[] };
    expect(list.canReset).toBe(true);
    expect(list.personas.find(p => p.id === 'diet-on-target')!.seeded).toBe(true);
    expect(opened).toHaveLength(1); // one pool, made on the first reset
  }, 60_000);

  it('can then be switched to, and the account has the data it was described with', async () => {
    const { base } = await serve({ qaOwnerDatabaseUrl: url, qaOwnerPool: owned() });
    const jar = await signUp(base, ADMIN);
    expect((await call(base, jar, 'POST', '/qa/personas/reset', { id: 'paid-monthly' })).status).toBe(200);
    expect((await call(base, jar, 'POST', '/qa/personas/switch', { id: 'paid-monthly' })).status).toBe(200);
    expect(await me(base, jar)).toBe(personaEmail('paid-monthly'));
  }, 60_000);

  it('refuses a stranger, no session, an unknown id, and the account you are on', async () => {
    const { base } = await serve({ qaOwnerDatabaseUrl: url, qaOwnerPool: owned() });
    expect((await call(base, new Jar(), 'POST', '/qa/personas/reset', { id: 'new-user' })).status).toBe(401);
    const stranger = await signUp(base, 'stranger@example.com');
    expect((await call(base, stranger, 'POST', '/qa/personas/reset', { id: 'new-user' })).status).toBe(403);
    const jar = await signUp(base, ADMIN);
    for (const id of ['', 'admin', 5, null]) expect((await call(base, jar, 'POST', '/qa/personas/reset', { id })).status).toBe(400);
    await call(base, jar, 'POST', '/qa/personas/reset', { id: 'founder' });
    await call(base, jar, 'POST', '/qa/personas/switch', { id: 'founder' });
    expect((await call(base, jar, 'POST', '/qa/personas/reset', { id: 'founder' })).status).toBe(409);
    expect(await me(base, jar)).toBe(personaEmail('founder'));
  }, 60_000);

  it('refuses a second reset while one runs (409)', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const slow = (u: string) => { const pool = new pg.Pool({ connectionString: u, max: 1 }); ownerPools.push(pool); const connect = pool.connect.bind(pool) as () => Promise<pg.PoolClient>; (pool as unknown as { connect: unknown }).connect = async () => { await gate; return connect(); }; return pool; };
    const { base } = await serve({ qaOwnerDatabaseUrl: url, qaOwnerPool: slow });
    const jar = await signUp(base, ADMIN);
    const first = call(base, jar, 'POST', '/qa/personas/reset', { id: 'lifetime' });
    await new Promise(r => setTimeout(r, 300));
    expect((await call(base, jar, 'POST', '/qa/personas/reset', { id: 'founder' })).status).toBe(409);
    release();
    expect((await first).status).toBe(200);
  }, 60_000);

  it('answers 404 and never opens the owner pool on a database without the QA mark, or with the setting off', async () => {
    opened.length = 0;
    await mark(null);
    const unmarked = await serve({ qaOwnerDatabaseUrl: url, qaOwnerPool: owned() });
    const jar = await signUp(unmarked.base, ADMIN);
    expect((await call(unmarked.base, jar, 'POST', '/qa/personas/reset', { id: 'new-user' })).status).toBe(404);
    await mark(QA_MARK);
    const off = await serve({ qaPersonas: false, qaOwnerDatabaseUrl: url, qaOwnerPool: owned() });
    expect((await call(off.base, jar, 'POST', '/qa/personas/reset', { id: 'new-user' })).status).toBe(404);
    expect(opened).toHaveLength(0);
  });

  it('is off (501) on a QA service with no owner URL, and says so in the list', async () => {
    const { base } = await serve();
    const jar = await signUp(base, ADMIN);
    expect((await call(base, jar, 'POST', '/qa/personas/reset', { id: 'new-user' })).status).toBe(501);
    expect(((await (await call(base, jar, 'GET', '/qa/personas')).json()) as { canReset: boolean }).canReset).toBe(false);
  });
});
