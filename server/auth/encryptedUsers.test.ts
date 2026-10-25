import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { createAuth, type AuthConfig } from './betterAuth.ts';

// Names and emails are sealed in auth."user" and auth.verification, and Better Auth still works on plain values (ADR 046).
let db: Kysely<DB>;
let url: string;
let stop: () => Promise<void>;
const SECRET = randomBytes(32).toString('base64');
const KEY = randomBytes(32);
const GOOGLE = { clientId: 'test-client.apps.googleusercontent.com', clientSecret: 'test-client-secret' };
const BASE = 'http://localhost:3999';
const EMAIL = 'ada.lovelace@example.com';

const running: { close: () => Promise<void> }[] = [];
async function serve(over: Partial<AuthConfig> = {}) {
  const auth = createAuth({ baseURL: BASE, secret: SECRET, databaseUrl: url, google: GOOGLE, testSignIn: true, ...over }, 'test');
  const server: Server = createApp({ db, auth }).listen(0);
  await new Promise(done => server.once('listening', done));
  running.push({ close: async () => { await new Promise<void>(done => server.close(() => done())); await auth.pool.end(); } });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const post = (base: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const cookieOf = (res: Response) => (res.headers.getSetCookie().find(c => /session_token=/.test(c)) ?? '').split(';')[0]!;
const signUp = (base: string) => post(base, '/api/auth/sign-up/email', { email: EMAIL, password: 'correct horse battery staple', name: 'Ada Lovelace' });
const signIn = (base: string) => post(base, '/api/auth/sign-in/email', { email: EMAIL, password: 'correct horse battery staple' });
const rawUsers = async () => (await sql<{ email: string; name: string; image: string | null }>`select email, name, image from auth."user"`.execute(db)).rows;

beforeAll(async () => { ({ db, stop, url } = await startTestDatabase()); }, 120_000);
afterAll(async () => { await Promise.all(running.map(r => r.close())); await stop?.(); });
beforeEach(async () => { await sql`delete from auth."user"`.execute(db); await sql`delete from auth.verification`.execute(db); });

describe('with PII_ENCRYPTION_KEY set', () => {
  it('stores a sealed email and name, yet the session and sign-in work on the plain values', async () => {
    const base = await serve({ piiKey: KEY });
    const res = await signUp(base);
    expect(res.status).toBe(200);
    const [row] = await rawUsers();
    expect(row!.email).toMatch(/^enc1:/);
    expect(row!.name).toMatch(/^enc1:/);
    // The sealed values are random base64url, so a short fragment like "ada" turns up by chance (CI failed on it); "lovelace" and the domain (a dot is not base64url) cannot.
    expect(JSON.stringify(row)).not.toMatch(/lovelace|example\.com/i);
    const me = await (await fetch(`${base}/api/auth/get-session`, { headers: { cookie: cookieOf(res) } })).json();
    expect(me).toMatchObject({ user: { email: EMAIL, name: 'Ada Lovelace' } });
    const again = await signIn(base);
    expect(again.status).toBe(200);
    expect(await rawUsers()).toHaveLength(1);
  });

  it('keeps one account per address: a second sign-up with the same email is refused', async () => {
    const base = await serve({ piiKey: KEY });
    await signUp(base);
    expect((await signUp(base)).status).not.toBe(200);
    expect(await rawUsers()).toHaveLength(1);
  });

  it('finds an account made before the switch-on (plaintext row) instead of making a second one', async () => {
    await signUp(await serve());
    expect((await rawUsers())[0]!.email).toBe(EMAIL);
    const base = await serve({ piiKey: KEY });
    const res = await signIn(base);
    expect(res.status).toBe(200);
    expect(await rawUsers()).toHaveLength(1);
    const me = await (await fetch(`${base}/api/auth/get-session`, { headers: { cookie: cookieOf(res) } })).json();
    expect(me).toMatchObject({ user: { email: EMAIL, name: 'Ada Lovelace' } });
  });

  it('stops matching plaintext rows once matchPlaintext is off', async () => {
    await signUp(await serve());
    const base = await serve({ piiKey: KEY, piiMatchPlaintext: false });
    expect((await signIn(base)).status).not.toBe(200);
  });

  it('refuses to read rows sealed under a different key', async () => {
    const res = await signUp(await serve({ piiKey: KEY }));
    expect(res.status).toBe(200);
    const other = await serve({ piiKey: randomBytes(32) });
    expect((await signIn(other)).status).not.toBe(200);
  });

  it('seals the address in the emailed-code record and signs in with the code', async () => {
    const sent: { email: string; otp: string }[] = [];
    const base = await serve({ piiKey: KEY, sendCode: async (email, otp) => { sent.push({ email, otp }); } });
    expect((await post(base, '/api/auth/email-otp/send-verification-otp', { email: EMAIL, type: 'sign-in' })).status).toBe(200);
    const ids = (await sql<{ identifier: string }>`select identifier from auth.verification`.execute(db)).rows;
    expect(ids).toHaveLength(1);
    expect(ids[0]!.identifier).toMatch(/^enc1:/);
    expect(ids[0]!.identifier).not.toContain('ada');
    const res = await post(base, '/api/auth/sign-in/email-otp', { email: EMAIL, otp: sent[0]!.otp });
    expect(res.status).toBe(200);
    const [row] = await rawUsers();
    expect(row!.email).toMatch(/^enc1:/);
    const me = await (await fetch(`${base}/api/auth/get-session`, { headers: { cookie: cookieOf(res) } })).json();
    expect(me).toMatchObject({ user: { email: EMAIL } });
  });

  it('an account made another way is the same account when the emailed code signs in with its address (sealed email lookup)', async () => {
    const sent: { email: string; otp: string }[] = [];
    const base = await serve({ piiKey: KEY, sendCode: async (email, otp) => { sent.push({ email, otp }); } });
    const first = await signUp(base);
    const before = await (await fetch(`${base}/api/auth/get-session`, { headers: { cookie: cookieOf(first) } })).json() as { user: { id: string } };
    await post(base, '/api/auth/email-otp/send-verification-otp', { email: EMAIL, type: 'sign-in' });
    const res = await post(base, '/api/auth/sign-in/email-otp', { email: EMAIL, otp: sent[0]!.otp });
    expect(res.status).toBe(200);
    const after = await (await fetch(`${base}/api/auth/get-session`, { headers: { cookie: cookieOf(res) } })).json() as { user: { id: string } };
    expect(after.user.id).toBe(before.user.id);
    expect(await rawUsers()).toHaveLength(1);
  });
});

describe('without the key', () => {
  it('stores names and emails as before', async () => {
    await signUp(await serve());
    expect(await rawUsers()).toEqual([{ email: EMAIL, name: 'Ada Lovelace', image: null }]);
  });
});
