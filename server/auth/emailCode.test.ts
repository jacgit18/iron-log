import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { authConfigFrom, createAuth, type AuthConfig } from './betterAuth.ts';
import { perAddressLimit, RESEND_TEST_FROM, resendSender } from './otpEmail.ts';

let db: Kysely<DB>;
let url: string;
let stop: () => Promise<void>;
const SECRET = randomBytes(32).toString('base64');
const GOOGLE = { clientId: 'test-client.apps.googleusercontent.com', clientSecret: 'test-client-secret' };
const BASE = 'http://localhost:3999';

const running: { close: () => Promise<void> }[] = [];
/** A server whose "sent" mail is kept in `sent`, newest last. */
async function serve(over: Partial<AuthConfig> = {}) {
  const sent: { email: string; otp: string }[] = [];
  const auth = createAuth({ baseURL: BASE, secret: SECRET, databaseUrl: url, google: GOOGLE, sendCode: async (email, otp) => void sent.push({ email, otp }), ...over }, 'test');
  const server: Server = createApp({ db, auth }).listen(0);
  await new Promise(done => server.once('listening', done));
  running.push({ close: async () => { await new Promise<void>(done => server.close(() => done())); await auth.pool.end(); } });
  return { sent, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

beforeAll(async () => {
  ({ db, stop, url } = await startTestDatabase());
}, 120_000);
afterAll(async () => {
  await Promise.all(running.map(r => r.close()));
  await stop?.();
});
beforeEach(async () => {
  await db.deleteFrom('users').execute();
  await sql`delete from auth."user"`.execute(db);
  await sql`delete from auth."verification"`.execute(db);
});

const post = (base: string, path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const ask = (base: string, email: string) => post(base, '/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' });
const enter = (base: string, email: string, otp: string) => post(base, '/api/auth/sign-in/email-otp', { email, otp });
const count = async (table: 'user' | 'session') => Number((await sql<{ n: string }>`select count(*) as n from auth.${sql.id(table)}`.execute(db)).rows[0]!.n);

describe('signing in with an emailed code', () => {
  it('sends a six-digit code, and the right code signs in with the same session cookie as Google', async () => {
    const { base, sent } = await serve();
    expect((await ask(base, 'lifter@example.com')).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ email: 'lifter@example.com', otp: expect.stringMatching(/^\d{6}$/) });
    const res = await enter(base, 'lifter@example.com', sent[0]!.otp);
    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie().find(c => /session_token=/.test(c)) ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const me = await (await fetch(`${base}/api/auth/get-session`, { headers: { cookie: cookie.split(';')[0]! } })).json();
    expect(me).toMatchObject({ user: { email: 'lifter@example.com', emailVerified: true } });
  });

  it('a wrong code is refused and makes no session', async () => {
    const { base, sent } = await serve();
    await ask(base, 'lifter@example.com');
    const wrong = sent[0]!.otp === '000000' ? '111111' : '000000';
    expect((await enter(base, 'lifter@example.com', wrong)).status).toBe(400);
    expect(await count('session')).toBe(0);
  });

  it('after three wrong tries even the right code stops working', async () => {
    const { base, sent } = await serve();
    await ask(base, 'lifter@example.com');
    const wrong = sent[0]!.otp === '000000' ? '111111' : '000000';
    for (let i = 0; i < 3; i++) await enter(base, 'lifter@example.com', wrong);
    expect((await enter(base, 'lifter@example.com', sent[0]!.otp)).status).not.toBe(200);
    expect(await count('session')).toBe(0);
  });

  it('a code works once', async () => {
    const { base, sent } = await serve();
    await ask(base, 'lifter@example.com');
    expect((await enter(base, 'lifter@example.com', sent[0]!.otp)).status).toBe(200);
    expect((await enter(base, 'lifter@example.com', sent[0]!.otp)).status).not.toBe(200);
    expect(await count('user')).toBe(1);
  });

  it('a code for one address does not sign in another', async () => {
    const { base, sent } = await serve();
    await ask(base, 'a@example.com');
    expect((await enter(base, 'b@example.com', sent[0]!.otp)).status).not.toBe(200);
    expect(await count('session')).toBe(0);
  });

  it('keeps only a hash of the code in the database', async () => {
    const { base, sent } = await serve();
    await ask(base, 'lifter@example.com');
    const rows = (await sql<{ value: string }>`select value from auth."verification"`.execute(db)).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some(r => r.value.includes(sent[0]!.otp))).toBe(false);
  });

  it('the same address signing in twice is one account', async () => {
    const { base, sent } = await serve();
    await ask(base, 'lifter@example.com');
    await enter(base, 'lifter@example.com', sent[0]!.otp);
    await ask(base, 'LIFTER@example.com');
    await enter(base, 'LIFTER@example.com', sent[1]!.otp);
    expect(await count('user')).toBe(1);
    expect(await count('session')).toBe(2);
  });

  it('sends at most three codes per address in ten minutes, and answers the same either way', async () => {
    const { base, sent } = await serve();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await ask(base, 'spam@example.com')).status);
    expect(statuses.every(s => s === 200)).toBe(true);
    expect(sent).toHaveLength(3);
  });

  it('a skipped request does not replace the code already sent: the third code still signs in after a fourth and fifth request', async () => {
    const { base, sent } = await serve();
    for (let i = 0; i < 5; i++) await ask(base, 'victim@example.com');
    expect(sent).toHaveLength(3);
    expect((await enter(base, 'victim@example.com', sent[2]!.otp)).status).toBe(200);
  });

  it('only ever sends sign-in codes: a password-reset request sends nothing', async () => {
    const { base, sent } = await serve();
    await post(base, '/api/auth/email-otp/request-password-reset', { email: 'lifter@example.com' });
    await post(base, '/api/auth/email-otp/send-verification-otp', { email: 'lifter@example.com', type: 'forget-password' });
    expect(sent).toHaveLength(0);
  });

  it('is refused for a new address once the signup cap is reached, and creates nothing', async () => {
    const { base, sent } = await serve({ signupCap: 0 });
    await ask(base, 'new@example.com');
    const res = await enter(base, 'new@example.com', sent[0]?.otp ?? '000000');
    expect(res.status).not.toBe(200);
    expect(await count('user')).toBe(0);
  });

  it('is not served at all when no sender is configured', async () => {
    const { base } = await serve({ sendCode: undefined });
    expect((await ask(base, 'lifter@example.com')).status).toBe(404);
  });

  it('a failing sender is logged without the address or code, the caller sees the usual answer, and a retry works', async () => {
    let fail = true;
    const sent: string[] = [];
    const { base } = await serve({ sendCode: async (_e, otp) => { if (fail) throw new Error('Resend refused the email: 403 domain not verified'); sent.push(otp); } });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await ask(base, 'lifter@example.com');
    expect(res.status).toBe(200);
    const logged = errors.mock.calls.map(c => String(c[0])).find(l => l.includes('sign-in code not sent'));
    expect(logged).toBeTruthy();
    expect(logged).not.toMatch(/lifter@example|\d{6}/);
    errors.mockRestore();
    fail = false;
    await ask(base, 'lifter@example.com');
    expect(sent).toHaveLength(1);
  });

  it('asking for codes is limited per client address', async () => {
    const auth = createAuth({ baseURL: BASE, secret: SECRET, databaseUrl: url, google: GOOGLE, sendCode: async () => {} }, 'test');
    const server: Server = createApp({ db, auth, authLimits: { signIn: { max: 2, windowMs: 60_000 }, other: { max: 100, windowMs: 60_000 } } }).listen(0);
    await new Promise(done => server.once('listening', done));
    running.push({ close: async () => { await new Promise<void>(done => server.close(() => done())); await auth.pool.end(); } });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await ask(base, `p${i}@example.com`)).status);
    expect(statuses).toEqual([200, 200, 429]);
  });
});

describe('owner-only while EMAIL_CODE_OPEN is not set', () => {
  const admins = new Set(['owner@example.com']);
  it('sends nothing, stores nothing and creates no account for anyone else, and answers as usual', async () => {
    const { base, sent } = await serve({ emailCodeAdminsOnly: true, capExempt: admins });
    expect((await ask(base, 'stranger@example.com')).status).toBe(200);
    expect(sent).toHaveLength(0);
    expect(Number((await sql<{ n: string }>`select count(*) as n from auth."verification"`.execute(db)).rows[0]!.n)).toBe(0);
    expect((await enter(base, 'stranger@example.com', '123456')).status).toBe(400);
    expect(await count('user')).toBe(0);
  });
  it('lets an admin address through, whatever its letter case', async () => {
    const { base, sent } = await serve({ emailCodeAdminsOnly: true, capExempt: admins });
    await ask(base, 'Owner@Example.com');
    expect(sent).toHaveLength(1);
    expect((await enter(base, 'Owner@Example.com', sent[0]!.otp)).status).toBe(200);
  });
  it('is the default from the environment, and EMAIL_CODE_OPEN=true releases it to everyone', () => {
    const env = { BETTER_AUTH_SECRET: 'x'.repeat(40), GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', BASE_URL: 'http://localhost:3002', DATABASE_URL: 'postgres://u@h/d', RESEND_API_KEY: 're_x' };
    expect(authConfigFrom(env)).toMatchObject({ config: { emailCodeAdminsOnly: true } });
    expect(authConfigFrom({ ...env, EMAIL_CODE_OPEN: 'true' })).toMatchObject({ config: { emailCodeAdminsOnly: false } });
  });
});

describe('resendSender', () => {
  const ok = () => new Response('{"id":"x"}', { status: 200 });
  it('posts to Resend with the key, the sender, the address and the code, and nothing else of ours', async () => {
    const fetchStub = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ok());
    await resendSender({ apiKey: 're_test_key', from: RESEND_TEST_FROM }, fetchStub as typeof fetch)('a@example.com', '123456');
    const [target, init] = fetchStub.mock.calls[0]!;
    expect(target).toBe('https://api.resend.com/emails');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer re_test_key');
    expect(JSON.parse(String(init!.body))).toMatchObject({ from: RESEND_TEST_FROM, to: ['a@example.com'], subject: expect.stringContaining('123456') });
  });
  it('throws when Resend refuses, without the key or the code in the message', async () => {
    const send = resendSender({ apiKey: 're_secret', from: RESEND_TEST_FROM }, (async () => new Response('domain not verified', { status: 403 })) as typeof fetch);
    const err = await send('a@example.com', '654321').catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/403/);
    expect((err as Error).message).not.toMatch(/re_secret|654321|a@example/);
  });
});

describe('perAddressLimit', () => {
  it('allows max per window, ignores letter case, and frees up when the window passes', () => {
    let t = 0;
    const allow = perAddressLimit(2, 1000, () => t);
    expect([allow('A@x.com'), allow('a@x.com'), allow('a@x.com')]).toEqual([true, true, false]);
    expect(allow('b@x.com')).toBe(true);
    t = 1001;
    expect(allow('a@x.com')).toBe(true);
  });
});

describe('authConfigFrom and the sender', () => {
  const env = { BETTER_AUTH_SECRET: 'x'.repeat(40), GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', BASE_URL: 'http://localhost:3002', DATABASE_URL: 'postgres://u@h/d' };
  it('has email codes off without RESEND_API_KEY and on with it, and the key is optional for the rest of sign-in', () => {
    expect(authConfigFrom(env)).toMatchObject({ enabled: true, config: { sendCode: undefined } });
    expect(authConfigFrom({ ...env, RESEND_API_KEY: 're_x' })).toMatchObject({ enabled: true, config: { sendCode: expect.any(Function) } });
    expect(authConfigFrom({ ...env, RESEND_API_KEY: '  ' })).toMatchObject({ enabled: true, config: { sendCode: undefined } });
  });
  it('never prints the Resend key in a reason', () => {
    const r = authConfigFrom({ ...env, BASE_URL: '', RESEND_API_KEY: 're_topsecret' });
    expect(JSON.stringify(r)).not.toContain('re_topsecret');
  });
});
