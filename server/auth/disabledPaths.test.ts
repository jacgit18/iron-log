import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { createAuth, unusedAuthPaths, type AuthConfig } from './betterAuth.ts';

// Better Auth mounts many routes the app never calls (an audit found the attempt counter on /email-otp/check-verification-otp is not
// atomic). They are switched off with `disabledPaths`; these tests pin the list against the pinned library so a typo, or a library
// upgrade that renames a route, shows up here, and check that every route the app does use still answers.
let db: Kysely<DB>;
let url: string;
let stop: () => Promise<void>;
const SECRET = randomBytes(32).toString('base64');
const GOOGLE = { clientId: 'test-client.apps.googleusercontent.com', clientSecret: 'test-client-secret' };
const BASE = 'http://localhost:3999';
const running: { close: () => Promise<void> }[] = [];

async function serve(over: Partial<AuthConfig> = {}) {
  const auth = createAuth({ baseURL: BASE, secret: SECRET, databaseUrl: url, google: GOOGLE, sendCode: async () => undefined, ...over }, 'test');
  const server: Server = createApp({ db, auth }).listen(0);
  await new Promise(done => server.once('listening', done));
  running.push({ close: async () => { await new Promise<void>(done => server.close(() => done())); await auth.pool.end(); } });
  return { auth, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

beforeAll(async () => {
  ({ db, stop, url } = await startTestDatabase());
}, 120_000);
afterAll(async () => {
  await Promise.all(running.map(r => r.close()));
  await stop?.();
});

type Endpoint = { path?: string; options?: { method?: string | string[] } };
const endpoints = (auth: object) => Object.values((auth as { api: Record<string, Endpoint> }).api).filter(e => typeof e.path === 'string');
const methodOf = (e: Endpoint) => [e.options?.method].flat().find((m): m is string => typeof m === 'string' && m !== '*') ?? 'POST';
const send = (base: string, e: Endpoint) => {
  const method = methodOf(e);
  return fetch(`${base}/api/auth${e.path}`, method === 'GET' ? { method } : { method, headers: { 'content-type': 'application/json' }, body: '{}' });
};
const post = (base: string, path: string, body: unknown) => fetch(`${base}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('routes Better Auth mounts but the app never calls', () => {
  it('every disabled path is a real route of the pinned library, so a typo or a rename cannot hide', async () => {
    const { auth } = await serve();
    const real = new Set(endpoints(auth).map(e => e.path));
    for (const path of unusedAuthPaths(false)) expect(real.has(path), `${path} is not a Better Auth route`).toBe(true);
  });

  it('each answers 404 before its handler runs, including the non-atomic attempt counter route', async () => {
    const { auth, base } = await serve();
    const disabled = new Set(unusedAuthPaths(false));
    const targets = endpoints(auth).filter(e => disabled.has(e.path!));
    expect(targets.length).toBe(disabled.size);
    expect(disabled.has('/email-otp/check-verification-otp')).toBe(true);
    for (const e of targets) expect((await send(base, e)).status, e.path).toBe(404);
  });

  it('the routes the app uses are untouched', async () => {
    const disabled = new Set(unusedAuthPaths(false));
    for (const used of ['/sign-in/social', '/sign-in/email-otp', '/email-otp/send-verification-otp', '/sign-out', '/get-session']) expect(disabled.has(used), used).toBe(false);
    const { base } = await serve();
    expect((await fetch(`${base}/api/auth/get-session`)).status).toBe(200);
    expect((await post(base, '/email-otp/send-verification-otp', { email: 'lifter@example.com', type: 'sign-in' })).status).toBe(200);
    const wrong = await post(base, '/sign-in/email-otp', { email: 'lifter@example.com', otp: '000000' });
    expect(wrong.status).toBe(400); // refused as a wrong code, not a missing route
    expect((await post(base, '/sign-out', {})).status).not.toBe(404);
    expect((await post(base, '/sign-in/social', { provider: 'google', callbackURL: '/' })).status).not.toBe(404);
  });

  it('email sign-up is off in production and stays available while the automated tests sign up through it', async () => {
    expect(unusedAuthPaths(false)).toContain('/sign-up/email');
    expect(unusedAuthPaths(true)).not.toContain('/sign-up/email');
    const off = await serve();
    expect((await post(off.base, '/sign-up/email', { email: 'a@example.com', password: 'correct horse battery staple', name: 'A' })).status).toBe(404);
    const on = await serve({ testSignIn: true });
    expect((await post(on.base, '/sign-up/email', { email: 'b@example.com', password: 'correct horse battery staple', name: 'B' })).status).toBe(200);
  });
});
