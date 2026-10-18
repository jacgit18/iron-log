import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { inUserTransaction } from './auth.ts';
import { createDb } from './db/connection.ts';
import type { DB } from './db/types.ts';
import { parseListQuery, parsePatch } from './issuesRoutes.ts';
import { startTestDatabase } from './test/postgres.ts';

// The admin Issues API (ADR 013 amendment, step 3): two locks, the ADMIN_EMAILS list at the route and users.is_admin in the database.
let owner: Kysely<DB>;
let app: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server | undefined;

beforeAll(async () => {
  let appUrl: string;
  ({ db: owner, stop, appUrl } = await startTestDatabase());
  app = createDb(appUrl);
}, 120_000);
afterAll(async () => {
  await app.destroy();
  await stop?.();
});
afterEach(() => new Promise<void>(done => (server ? server.close(() => done()) : done())));

const FP = (n: number) => n.toString(16).padStart(12, '0');
beforeEach(async () => {
  await owner.deleteFrom('issues').execute();
  await owner.insertInto('issues').values([
    { fingerprint: FP(1), kind: 'error', message: 'old fixed', status: 'fixed', last_seen: sql`now() - interval '3 days'` },
    { fingerprint: FP(2), kind: 'server', message: 'recent open', occurrences: '5', last_seen: sql`now() - interval '1 hour'`, first_version: '10', last_version: '12', page: '/api/x', top_frame: 'foo /a.ts:1:2' },
    { fingerprint: FP(3), kind: 'sync', message: 'older open', last_seen: sql`now() - interval '2 hours'` },
    { fingerprint: FP(4), kind: 'error', message: 'investigating one', status: 'investigating', last_seen: sql`now() - interval '1 minute'` },
    { fingerprint: FP(5), kind: 'error', message: 'ignored one', status: 'ignored' },
  ]).execute();
});

async function start(admins: string[], limits?: Parameters<typeof createApp>[0] extends infer D ? (D extends { limits?: infer L } ? L : never) : never) {
  server = createApp({ db: app, admins: new Set(admins), limits }).listen(0);
  await new Promise(done => server!.once('listening', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // A dev user is created on first sight; marking it is_admin in the database is done here, as the owner.
  const call = (who: string, method: string, path: string, body?: unknown) =>
    fetch(`${base}/api/issues${path}`, { method, headers: { 'x-dev-user': who, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const makeAdmin = async (who: string, flag = true) => {
    await fetch(`${base}/api/me`, { headers: { 'x-dev-user': who } });
    await owner.updateTable('users').set({ is_admin: flag }).where('auth_user_id', '=', `dev:${who}`).execute();
  };
  return { call, makeAdmin };
}

describe('the two locks', () => {
  it('a user who is not on the admin list gets 403 on both routes', async () => {
    const { call, makeAdmin } = await start(['dev:boss']);
    await makeAdmin('guest'); // is_admin in the database is not enough on its own
    expect((await call('guest', 'GET', '')).status).toBe(403);
    expect((await call('guest', 'PATCH', `/${FP(2)}`, { status: 'fixed' })).status).toBe(403);
  });

  it('a user on the admin list whose database flag is not set also gets 403, and nothing is changed', async () => {
    const { call, makeAdmin } = await start(['dev:boss']);
    await makeAdmin('boss', false);
    expect((await call('boss', 'GET', '')).status).toBe(403);
    expect((await call('boss', 'PATCH', `/${FP(2)}`, { status: 'fixed' })).status).toBe(403);
    expect((await owner.selectFrom('issues').select('status').where('fingerprint', '=', FP(2)).executeTakeFirstOrThrow()).status).toBe('open');
  });

  it('the functions refuse on their own: a signed-in non-admin, and a connection with no user', async () => {
    const id = (await owner.insertInto('users').values({ auth_user_id: 'plain' }).returning('id').executeTakeFirstOrThrow()).id;
    await expect(inUserTransaction(app, id, trx => sql`select * from list_issues()`.execute(trx))).rejects.toMatchObject({ code: '42501' });
    await expect(inUserTransaction(app, id, trx => sql`select issue_counts()`.execute(trx))).rejects.toMatchObject({ code: '42501' });
    await expect(inUserTransaction(app, id, trx => sql`select set_issue_status(${FP(2)}, 'fixed', null)`.execute(trx))).rejects.toMatchObject({ code: '42501' });
    await expect(sql`select * from list_issues()`.execute(app)).rejects.toMatchObject({ code: '42501' });
  });
});

describe('the per-user limit', () => {
  it('answers 429 with Retry-After once an admin has made more calls than the limit in a window', async () => {
    const { call, makeAdmin } = await start(['dev:boss'], { issues: { max: 2, windowMs: 60_000 } });
    await makeAdmin('boss');
    expect((await call('boss', 'GET', '')).status).toBe(200);
    expect((await call('boss', 'GET', '')).status).toBe(200);
    const limited = await call('boss', 'GET', '');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });
});

describe('GET /api/issues', () => {
  it('lists open first, then investigating, fixed, ignored, newest last-seen first, with counts', async () => {
    const { call, makeAdmin } = await start(['dev:boss']);
    await makeAdmin('boss');
    const body = (await (await call('boss', 'GET', '')).json()) as { ok: boolean; counts: Record<string, number>; issues: Array<{ fingerprint: string; occurrences: number; topFrame: string; firstVersion: string; lastSeen: string }> };
    expect(body.ok).toBe(true);
    expect(body.counts).toEqual({ fixed: 1, ignored: 1, investigating: 1, open: 2 });
    expect(body.issues.map(i => i.fingerprint)).toEqual([FP(2), FP(3), FP(4), FP(1), FP(5)]);
    expect(body.issues[0]).toMatchObject({ occurrences: 5, topFrame: 'foo /a.ts:1:2', firstVersion: '10', page: '/api/x', kind: 'server' });
    expect(new Date(body.issues[0]!.lastSeen).toString()).not.toBe('Invalid Date');
  });

  it('filters by status and limits the count, and refuses what it does not understand', async () => {
    const { call, makeAdmin } = await start(['dev:boss']);
    await makeAdmin('boss');
    const open = (await (await call('boss', 'GET', '?status=open')).json()) as { issues: unknown[]; counts: Record<string, number> };
    expect(open.issues).toHaveLength(2);
    expect(open.counts.fixed).toBe(1); // counts cover the whole table, not the filter
    expect(((await (await call('boss', 'GET', '?limit=1')).json()) as { issues: unknown[] }).issues).toHaveLength(1);
    for (const q of ['?status=nope', '?limit=0', '?limit=201', '?limit=abc', '?status=open&status=fixed']) expect((await call('boss', 'GET', q)).status).toBe(422);
  });
});

describe('PATCH /api/issues/:fingerprint', () => {
  it('changes the status and the note, each on its own, and keeps them', async () => {
    const { call, makeAdmin } = await start(['dev:boss']);
    await makeAdmin('boss');
    expect((await call('boss', 'PATCH', `/${FP(2)}`, { status: 'investigating' })).status).toBe(200);
    expect((await call('boss', 'PATCH', `/${FP(2)}`, { note: 'looks like the sync retry' })).status).toBe(200);
    const row = await owner.selectFrom('issues').selectAll().where('fingerprint', '=', FP(2)).executeTakeFirstOrThrow();
    expect(row).toMatchObject({ status: 'investigating', note: 'looks like the sync retry' });
    expect((await call('boss', 'PATCH', `/${FP(2)}`, { note: '' })).status).toBe(200); // an empty note clears it
    expect((await owner.selectFrom('issues').select('note').where('fingerprint', '=', FP(2)).executeTakeFirstOrThrow()).note).toBe('');
  });

  it('answers 404 for a fingerprint that is not stored, and 422 for input it will not take', async () => {
    const { call, makeAdmin } = await start(['dev:boss']);
    await makeAdmin('boss');
    expect((await call('boss', 'PATCH', `/${FP(99)}`, { status: 'fixed' })).status).toBe(404);
    for (const [path, body] of [
      [`/${FP(2)}`, {}], [`/${FP(2)}`, { status: 'nope' }], [`/${FP(2)}`, { note: 5 }], [`/${FP(2)}`, { note: 'x'.repeat(2001) }],
      [`/${FP(2)}`, { status: 'fixed', first_seen: 'now' }], [`/${FP(2)}`, [1]], ['/not-a-fingerprint', { status: 'fixed' }],
    ] as const) expect((await call('boss', 'PATCH', path, body)).status).toBe(422);
    expect((await owner.selectFrom('issues').select('status').where('fingerprint', '=', FP(2)).executeTakeFirstOrThrow()).status).toBe('open');
  });
});

describe('parseListQuery and parsePatch', () => {
  it('take only what the screen sends', () => {
    expect(parseListQuery({})).toEqual({ status: null, limit: 100 });
    expect(parseListQuery({ status: 'fixed', limit: '25' })).toEqual({ status: 'fixed', limit: 25 });
    expect(parseListQuery({ status: ['open'] })).toBeNull();
    expect(parsePatch({ status: 'ignored' })).toEqual({ status: 'ignored', note: null });
    expect(parsePatch({ note: '' })).toEqual({ status: null, note: '' });
    expect(parsePatch(null)).toBeNull();
  });
});
