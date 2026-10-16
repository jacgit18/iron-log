import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import type { DB } from './db/types.ts';
import { startTestDatabase } from './test/postgres.ts';

// The one-time upload of a phone's old data may be 4 MB, but that allowance must start only after sign-in and the per-user limit: an
// anonymous caller gets no body parser on this route at all, so it cannot make the single small instance buffer and parse 4 MB a request
// (security audit run-2). Every other route keeps the 100 kb limit.
let db: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server;
let base: string;

beforeAll(async () => {
  ({ db, stop } = await startTestDatabase());
  server = createApp({ db, limits: { importLegacy: { max: 3, windowMs: 60_000 } } }).listen(0);
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

const post = (path: string, body: string, user?: string) =>
  fetch(`${base}/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-version': 'test-1', ...(user ? { 'x-dev-user': user } : {}) }, body });
const big = (bytes: number) => JSON.stringify({ clientId: 'x', baseVersion: null, input: { pad: 'x'.repeat(bytes) } });
const imports = (n: number) =>
  JSON.stringify({ clientId: 'import-legacy', baseVersion: null, input: { commands: Array.from({ length: n }, (_, i) => ({ name: 'log-session', clientId: `i${i}`, input: { exerciseId: 'squat', entry: { d: '2026-10-05', w: 135, n: 'x'.repeat(450) } } })) } });

describe('the 4 MB import-legacy parser', () => {
  it('is not reached by an anonymous caller: a 5 MB body is answered 401, not 413 from the parser', async () => {
    const res = await post('commands/import-legacy', big(5_000_000));
    expect(res.status).toBe(401);
  });

  it('is not reached by an anonymous caller on a path variant either', async () => {
    expect((await post('Commands/Import-Legacy', big(5_000_000))).status).toBe(401);
    expect((await post('commands/import-legacy/', big(5_000_000))).status).toBe(401);
  });

  it('still accepts a signed-in import above 100 kb, and still refuses one above 4 MB', async () => {
    const body = imports(300); // a few long notes, not thousands of rows: the size is what is under test, and the database work stays small
    expect(body.length).toBeGreaterThan(100_000);
    expect((await post('commands/import-legacy', body, 'ann')).status).toBe(201);
    expect((await post('commands/import-legacy', big(5_000_000), 'bob')).status).toBe(413);
  }, 30_000);

  it('counts a signed-in 5 MB attempt against the per-user limit before parsing it', async () => {
    for (let i = 0; i < 3; i++) expect((await post('commands/import-legacy', big(5_000_000), 'cy')).status).toBe(413);
    expect((await post('commands/import-legacy', big(5_000_000), 'cy')).status).toBe(429);
  });

  it('leaves every other route on the 100 kb limit, signed in or not', async () => {
    expect((await post('commands/log-session', big(150_000), 'ann')).status).toBe(413);
    expect((await post('commands/log-session', big(150_000))).status).toBe(413);
  });
});
