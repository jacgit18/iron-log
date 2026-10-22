import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransport } from '../src/sync/transport.ts';
import { createApp } from './app.ts';
import type { DB } from './db/types.ts';
import { startTestDatabase } from './test/postgres.ts';

let db: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server;
let base: string;

beforeAll(async () => {
  ({ db, stop } = await startTestDatabase());
  server = createApp({ db }).listen(0);
  await new Promise(done => server.once('listening', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);
afterAll(async () => {
  await new Promise<void>(done => server.close(() => done()));
  await stop?.();
});
beforeEach(async () => {
  await db.deleteFrom('users').execute();
  vi.spyOn(console, 'error').mockImplementation(() => undefined); // the refusal logs one line
});

const headers = (user: string, expected?: string) => ({ 'content-type': 'application/json', 'x-dev-user': user, ...(expected !== undefined ? { 'x-expected-user': expected } : {}) });
const idOf = async (user: string): Promise<string> => ((await (await fetch(`${base}/api/me`, { headers: headers(user) })).json()) as { userId: string }).userId;
const log = (user: string, expected?: string) =>
  fetch(`${base}/api/commands/log-session`, { method: 'POST', headers: headers(user, expected), body: JSON.stringify({ clientId: 'L1', baseVersion: null, input: { exerciseId: 'squat', entry: { d: '2026-10-05', w: 135 } } }) });
const rows = async () => (await db.selectFrom('log_entries').selectAll().execute()).length;

describe('x-expected-user', () => {
  it('refuses a command meant for another account with 409 account, and writes nothing', async () => {
    const alice = await idOf('alice');
    await idOf('bob');
    const res = await log('bob', alice);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: 'account' });
    expect(await rows()).toBe(0);
  });

  it('refuses a pull and the one-time upload the same way', async () => {
    const alice = await idOf('alice');
    await idOf('bob');
    const pull = await fetch(`${base}/api/sync?since=0`, { headers: headers('bob', alice) });
    expect(pull.status).toBe(409);
    expect(await pull.json()).toEqual({ ok: false, error: 'account' });
    const upload = await fetch(`${base}/api/commands/import-legacy`, { method: 'POST', headers: headers('bob', alice), body: JSON.stringify({ clientId: 'import-legacy', baseVersion: null, input: { commands: [] } }) });
    expect(upload.status).toBe(409);
    expect((await upload.json()) as { error: string }).toMatchObject({ error: 'account' });
  });

  it('is read by the real client transport as an account pause, never a stale-row conflict', async () => {
    const alice = await idOf('alice');
    await idOf('bob');
    const transport = createTransport({ clientVersion: '1', baseUrl: base, headers: () => ({ 'x-dev-user': 'bob', 'x-expected-user': alice }) });
    const sent = await transport.command('log-session', { clientId: 'L1', baseVersion: null, input: { exerciseId: 'squat', entry: { d: '2026-10-05', w: 135 } } });
    expect(sent).toMatchObject({ ok: false, class: 'account', status: 409 });
    expect(await transport.pull('0')).toMatchObject({ ok: false, class: 'account' });
    expect(await rows()).toBe(0);
  });

  it('takes a request with no header, as an older client sends it', async () => {
    const res = await log('bob');
    expect(res.ok).toBe(true);
    expect(await rows()).toBe(1);
  });

  it('takes a request that names the signed-in user', async () => {
    const bob = await idOf('bob');
    const res = await log('bob', bob);
    expect(res.ok).toBe(true);
    expect(await rows()).toBe(1);
  });

  it('logs the refusal without a user id', async () => {
    const alice = await idOf('alice');
    await idOf('bob');
    await log('bob', alice);
    const lines = vi.mocked(console.error).mock.calls.map(c => String(c[0]));
    expect(lines.some(l => l.includes('another account'))).toBe(true);
    expect(lines.every(l => !l.includes(alice))).toBe(true);
  });
});
