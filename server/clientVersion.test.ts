import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { minVersionFrom, parseVersion } from './clientVersion.ts';
import type { DB } from './db/types.ts';
import { startTestDatabase } from './test/postgres.ts';

describe('parseVersion', () => {
  it('reads a plain number and nothing else', () => {
    expect(parseVersion('1791430867')).toBe(1791430867);
    expect(parseVersion('0')).toBe(0);
    for (const bad of [undefined, '', 'dev', '1.2.3', '-5', '12e3', ' 5', '1234567890123']) expect(parseVersion(bad), String(bad)).toBeNull();
  });
});

describe('minVersionFrom', () => {
  it('is no gate when unset or blank', () => {
    expect(minVersionFrom(undefined)).toBeNull();
    expect(minVersionFrom('')).toBeNull();
    expect(minVersionFrom('  ')).toBeNull();
  });
  it('is the number when valid', () => {
    expect(minVersionFrom('1791430867')).toBe(1791430867);
    expect(minVersionFrom(' 42 ')).toBe(42);
  });
  it('stops the server from starting on a typo instead of silently switching the gate off', () => {
    expect(() => minVersionFrom('v1.2')).toThrow(/MIN_CLIENT_VERSION must be a whole number/);
    expect(() => minVersionFrom('-1')).toThrow();
  });
});

let db: Kysely<DB>;
let stop: () => Promise<void>;
let gated: Server;
let open: Server;
let gatedBase: string;
let openBase: string;
const MIN = 1_000_000;

beforeAll(async () => {
  ({ db, stop } = await startTestDatabase());
  gated = createApp({ db, minClientVersion: MIN }).listen(0);
  open = createApp({ db }).listen(0);
  await Promise.all([gated, open].map(s => new Promise(done => s.once('listening', done))));
  gatedBase = `http://127.0.0.1:${(gated.address() as AddressInfo).port}`;
  openBase = `http://127.0.0.1:${(open.address() as AddressInfo).port}`;
}, 120_000);
afterAll(async () => {
  await Promise.all([gated, open].map(s => new Promise<void>(done => s.close(() => done()))));
  await stop?.();
});
beforeEach(async () => {
  await db.deleteFrom('users').execute();
});

const body = { clientId: 'L1', baseVersion: null, input: { exerciseId: 'squat', entry: { d: '2026-10-05', w: 135 } } };
const post = (base: string, version: string | undefined, user: string | null = 'owner') =>
  fetch(`${base}/api/commands/log-session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(user ? { 'x-dev-user': user } : {}), ...(version !== undefined ? { 'x-client-version': version } : {}) },
    body: JSON.stringify(body),
  });
const pull = (base: string, version: string | undefined) => fetch(`${base}/api/sync?since=0`, { headers: { 'x-dev-user': 'owner', ...(version !== undefined ? { 'x-client-version': version } : {}) } });
const rows = async () => (await db.selectFrom('log_entries').selectAll().execute()).length;

describe('the gate', () => {
  it('refuses an older app with 426 and the minimum, and writes nothing', async () => {
    const res = await post(gatedBase, String(MIN - 1));
    expect(res.status).toBe(426);
    expect(res.headers.get('x-min-client-version')).toBe(String(MIN));
    expect(await res.json()).toEqual({ ok: false, error: 'update-required', minClientVersion: MIN });
    expect(await rows()).toBe(0);
  });

  it('lets the minimum and anything newer through', async () => {
    expect((await post(gatedBase, String(MIN))).status).toBe(201);
    expect((await post(gatedBase, String(MIN + 1000))).status).toBe(200); // same id: a retry of the create
    expect(await rows()).toBe(1);
  });

  it('refuses a pull from an older app too', async () => {
    expect((await pull(gatedBase, String(MIN - 1))).status).toBe(426);
    expect((await pull(gatedBase, String(MIN))).status).toBe(200);
  });

  it('refuses a request that says nothing, or something that is not a build number', async () => {
    for (const v of [undefined, '', 'banana', '1.2.3']) expect((await post(gatedBase, v)).status, String(v)).toBe(426);
  });

  it('tells an older app before it asks who is signed in: 426, not 401', async () => {
    expect((await post(gatedBase, String(MIN - 1), null)).status).toBe(426);
    expect((await post(gatedBase, String(MIN), null)).status).toBe(401);
  });

  it('lets a development build through where the dev sign-in is allowed, and refuses it elsewhere', async () => {
    expect((await post(gatedBase, 'dev')).status).toBe(201); // vitest runs with NODE_ENV=test
    const was = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const prod = createApp({ db, minClientVersion: MIN }).listen(0);
      await new Promise(done => prod.once('listening', done));
      const res = await post(`http://127.0.0.1:${(prod.address() as AddressInfo).port}`, 'dev');
      expect(res.status).toBe(426);
      await new Promise<void>(done => prod.close(() => done()));
    } finally {
      process.env.NODE_ENV = was;
    }
  });

  it('does not touch the health checks', async () => {
    expect((await fetch(`${gatedBase}/api/health`)).status).toBe(200);
    expect((await fetch(`${gatedBase}/api/health/db`)).status).toBe(200);
  });

  it('is no gate at all when no minimum is set', async () => {
    expect((await post(openBase, undefined)).status).toBe(201);
    expect((await post(openBase, 'banana')).status).toBe(200);
  });
});

describe('/api/me', () => {
  it('says who is signed in and the minimum build, so the app can check before it sends', async () => {
    const res = await fetch(`${gatedBase}/api/me`, { headers: { 'x-dev-user': 'owner' } });
    expect(await res.json()).toMatchObject({ ok: true, minClientVersion: MIN });
    expect(((await (await fetch(`${openBase}/api/me`, { headers: { 'x-dev-user': 'owner' } })).json()) as { minClientVersion: unknown }).minClientVersion).toBeNull();
  });
});
