import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import type { DB } from './db/types.ts';
import { startTestDatabase } from './test/postgres.ts';

// The limits after sign-in count per user, so one phone's loop does not use up a shared network's allowance, and a limited call is a
// 429 with Retry-After (which the phone treats as "wait and try again", never "drop it").
let db: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server;
let base: string;

beforeAll(async () => {
  ({ db, stop } = await startTestDatabase());
  server = createApp({ db, limits: { commands: { max: 2, windowMs: 60_000 }, sync: { max: 3, windowMs: 60_000 }, importLegacy: { max: 1, windowMs: 60_000 } } }).listen(0);
  await new Promise(done => server.once('listening', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);
afterAll(async () => {
  await new Promise<void>(done => server.close(() => done()));
  await stop?.();
});
beforeEach(async () => {
  await db.deleteFrom('users').execute();
});

const call = (path: string, user: string, init: RequestInit = {}) =>
  fetch(`${base}/api/${path}`, { ...init, headers: { 'content-type': 'application/json', 'x-dev-user': user, 'x-client-version': 'test-1' } });
const log = (user: string, id: string) =>
  call('commands/log-session', user, { method: 'POST', body: JSON.stringify({ clientId: id, baseVersion: null, input: { exerciseId: 'squat', entry: { d: '2026-10-05', w: 135 } } }) });

describe('limits after sign-in', () => {
  it('commands are limited per user, with Retry-After, and another user is not affected', async () => {
    expect((await log('ann', 'a1')).status).toBe(201);
    expect((await log('ann', 'a2')).status).toBe(201);
    const limited = await log('ann', 'a3');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await log('bob', 'b1')).status).toBe(201); // same address, different user
    expect(await db.selectFrom('log_entries').select('client_id').where('client_id', '=', 'a3').execute()).toEqual([]); // the limited call wrote nothing
  });

  it('pulls are limited per user, separately from commands', async () => {
    for (let i = 0; i < 3; i++) expect((await call('sync?since=0', 'ann')).status).toBe(200);
    expect((await call('sync?since=0', 'ann')).status).toBe(429);
    expect((await call('sync?since=0', 'bob')).status).toBe(200);
    expect((await log('ann', 'a1')).status).toBe(201);
  });

  it('the one-time upload has its own, much lower, limit', async () => {
    const body = JSON.stringify({ clientId: 'import-legacy', baseVersion: null, input: { commands: [{ name: 'log-session', clientId: 'i1', input: { exerciseId: 'squat', entry: { d: '2026-10-05', w: 135 } } }] } });
    expect((await call('commands/import-legacy', 'ann', { method: 'POST', body })).status).toBe(201);
    expect((await call('commands/import-legacy', 'ann', { method: 'POST', body })).status).toBe(429);
  });

  it('health and the sign-in check are not touched by the command limits', async () => {
    for (let i = 0; i < 5; i++) expect((await fetch(`${base}/api/health`)).status).toBe(200);
  });
});
