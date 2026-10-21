import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { createDb } from './db/connection.ts';
import type { DB } from './db/types.ts';
import { startTestDatabase } from './test/postgres.ts';

// Code audit S-03 and S-04, through the real routes and a real database: a command carrying a NUL byte or JSON nested thousands deep is refused with a 422 (it was a 500, which
// also raised the 5xx alert), and what a refused write leaves in refused_writes is small however big the request was.
let owner: Kysely<DB>; let app: Kysely<DB>; let stop: () => Promise<void>; let server: Server; let base: string;
const big = { max: 1e6, windowMs: 60_000 };
beforeAll(async () => {
  let appUrl: string;
  ({ db: owner, stop, appUrl } = await startTestDatabase());
  app = createDb(appUrl);
  server = createApp({ db: app, limits: { api: big, commands: big, sync: big, push: big, clientErrors: big, importLegacy: big, healthDb: big, issues: big, pushFire: big } as never }).listen(0);
  await new Promise(done => server.once('listening', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);
afterAll(async () => { await new Promise<void>(done => server.close(() => done())); await app.destroy(); await stop?.(); });
beforeEach(async () => { await owner.deleteFrom('users').execute(); await owner.deleteFrom('issues').execute(); });

const h = { 'x-dev-user': 'fuzz', 'x-client-version': 'test-1', 'content-type': 'application/json' };
const run = (command: string, body: unknown) => fetch(`${base}/api/commands/${command}`, { method: 'POST', headers: h, body: typeof body === 'string' ? body : JSON.stringify(body) });
const COMMANDS = ['log-session', 'tick-card', 'delete-entry', 'log-body-weight', 'save-week', 'save-config', 'save-stretch-week', 'save-supplement-day'];
const NUL = 'a\u0000b';

describe('a command the database cannot store', () => {
  it.each(COMMANDS)('%s: a NUL byte in the client id or the input answers 422, never 500', async command => {
    const inClientId = await run(command, { clientId: NUL, baseVersion: null, input: {} });
    const inInput = await run(command, { clientId: 'c', baseVersion: null, input: { id: NUL, exerciseId: NUL, d: NUL, weekStart: NUL, month: NUL, key: NUL, entry: { id: NUL, ex: NUL, n: NUL, d: NUL }, config: { ex: { a: NUL } } } });
    expect(inClientId.status).toBe(422);
    expect(inInput.status).toBe(422);
  });

  it('save-config with the content nested 8000 deep answers 422, and the feed still loads', async () => {
    const depth = 8000;
    const body = `{"clientId":"deep","baseVersion":null,"input":{"config":{"ex":${'{"a":'.repeat(depth)}1${'}'.repeat(depth)}}}}`;
    const res = await run('save-config', body);
    expect(res.status).toBe(422);
    expect((await fetch(`${base}/api/sync`, { headers: h })).status).toBe(200);
  });

  it('raises no server issue (so no 5xx alert) for any of it', async () => {
    for (const command of COMMANDS) await run(command, { clientId: NUL, baseVersion: null, input: { id: NUL } });
    expect(await owner.selectFrom('issues').select(['kind', 'message']).execute()).toEqual([]);
  });
});

describe('what a refused write leaves behind', () => {
  it('is a short summary, however big the refused request was', async () => {
    const junk = 'abcdef0123456789'.repeat(5_000);
    for (let i = 0; i < 10; i++) expect((await run('save-week', { clientId: `c${i}`, baseVersion: null, input: { weekStart: 'bad', junk } })).status).toBe(422);
    const { n, bytes } = (await sql<{ n: string; bytes: string }>`select count(*) as n, sum(length(payload::text)) as bytes from refused_writes`.execute(owner)).rows[0]!;
    expect(Number(n)).toBe(10);
    expect(Number(bytes)).toBeLessThan(10 * 1200);
  });
});
