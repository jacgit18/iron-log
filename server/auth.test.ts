import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { devAuthAllowed, inUserTransaction } from './auth.ts';
import type { DB } from './db/types.ts';
import { startTestDatabase } from './test/postgres.ts';

let db: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server | undefined;

beforeAll(async () => {
  ({ db, stop } = await startTestDatabase());
}, 120_000);

afterEach(() => new Promise<void>(done => (server ? server.close(() => done()) : done())));

afterAll(async () => {
  await stop?.();
});

async function start(withDb = true, admins?: ReadonlySet<string>) {
  server = createApp({ db: withDb ? db : undefined, admins }).listen(0);
  await new Promise(done => server!.once('listening', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('admin flag on /api/me', () => {
  const me = async (url: string, name: string) => ((await (await fetch(`${url}/api/me`, { headers: { 'x-dev-user': name } })).json()) as { account: { isAdmin: boolean } }).account.isAdmin;
  it('is true only for a dev user named in the admin list', async () => {
    const url = await start(true, new Set(['dev:owner']));
    expect(await me(url, 'owner')).toBe(true);
    expect(await me(url, 'guest')).toBe(false);
  });
  it('is false for everyone when no list is given', async () => {
    expect(await me(await start(), 'owner')).toBe(false);
  });
});

describe('dev auth stub', () => {
  it('answers 401 without the header', async () => {
    const res = await fetch(`${await start()}/api/me`);
    expect(res.status).toBe(401);
  });

  it('answers 401 for a malformed name', async () => {
    const res = await fetch(`${await start()}/api/me`, { headers: { 'x-dev-user': "owner'; drop table users" } });
    expect(res.status).toBe(401);
  });

  it('signs in the named dev user, creating the row once', async () => {
    const base = await start();
    const first = (await (await fetch(`${base}/api/me`, { headers: { 'x-dev-user': 'owner' } })).json()) as { userId: string };
    const second = (await (await fetch(`${base}/api/me`, { headers: { 'x-dev-user': 'owner' } })).json()) as { userId: string };
    const other = (await (await fetch(`${base}/api/me`, { headers: { 'x-dev-user': 'tester' } })).json()) as { userId: string };
    expect(second.userId).toBe(first.userId);
    expect(other.userId).not.toBe(first.userId);
    const rows = await db.selectFrom('users').select('auth_user_id').where('auth_user_id', '=', 'dev:owner').execute();
    expect(rows).toHaveLength(1);
  });

  it('is refused outside development and test, even with the header', async () => {
    const base = await start();
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await fetch(`${base}/api/me`, { headers: { 'x-dev-user': 'owner' } });
      expect(res.status).toBe(401);
    } finally {
      process.env.NODE_ENV = before;
    }
    expect([devAuthAllowed('production'), devAuthAllowed(undefined), devAuthAllowed('development'), devAuthAllowed('test')]).toEqual([false, false, true, true]);
  });

  it('answers 503 on /api routes when no database is configured', async () => {
    const res = await fetch(`${await start(false)}/api/me`);
    expect(res.status).toBe(503);
  });

  it('keeps health open without sign-in', async () => {
    expect((await fetch(`${await start()}/api/health`)).status).toBe(200);
  });
});

describe('inUserTransaction', () => {
  it('sets app.user_id inside the transaction and clears it afterwards', async () => {
    const inside = await inUserTransaction(db, '42', async trx => (await sql<{ v: string }>`select current_setting('app.user_id') as v`.execute(trx)).rows[0]?.v);
    expect(inside).toBe('42');
    const after = await sql<{ v: string | null }>`select current_setting('app.user_id', true) as v`.execute(db);
    expect(after.rows[0]?.v ?? '').toBe('');
  });
});
