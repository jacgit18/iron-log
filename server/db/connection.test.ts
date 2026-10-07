import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { startTestDatabase } from '../test/postgres.ts';
import type { DB } from './types.ts';

// A zone ahead of UTC: a local-midnight Date for 2026-10-07 is still 2026-10-06 in UTC.
process.env.TZ = 'Asia/Tokyo';

let db: Kysely<DB>;
let url: string;
let stop: () => Promise<void>;

beforeAll(async () => {
  ({ db, url, stop } = await startTestDatabase());
}, 120_000);

afterAll(async () => {
  await stop?.();
});

async function insertEntry() {
  const user = await db.insertInto('users').values({ auth_user_id: 'test-user' }).returning('id').executeTakeFirstOrThrow();
  await db
    .insertInto('log_entries')
    .values({ user_id: user.id, client_id: 'e1', seq: 1, exercise_id: 'squat', d: '2026-10-07', slot: 's1', wk: '2026-10-04', auto: true, weight_lb: '135.5' })
    .execute();
}

describe('date handling (ADR 011)', () => {
  it('reads d and wk back as the same YYYY-MM-DD strings', async () => {
    await insertEntry();
    const row = await db.selectFrom('log_entries').select(['d', 'wk']).where('client_id', '=', 'e1').executeTakeFirstOrThrow();
    expect(row).toEqual({ d: '2026-10-07', wk: '2026-10-04' });
  });

  it('would shift a day with the default pg parser (why the custom parser exists)', async () => {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const { rows } = await client.query('select d from log_entries where client_id = $1', ['e1']);
      expect(rows[0].d).toBeInstanceOf(Date);
      expect(rows[0].d.toISOString().slice(0, 10)).toBe('2026-10-06');
    } finally {
      await client.end();
    }
  });

  it('returns numeric and bigint columns as strings (ADR 006)', async () => {
    const row = await db.selectFrom('log_entries').select(['id', 'weight_lb']).where('client_id', '=', 'e1').executeTakeFirstOrThrow();
    expect(typeof row.id).toBe('string');
    expect(row.weight_lb).toBe('135.5000');
  });
});

describe('dropped connections', () => {
  it('survives the database closing an idle connection, and the next query works', async () => {
    await sql`select 1`.execute(db); // leaves an idle connection in the pool
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    try {
      await admin.query('select pg_terminate_backend(pid) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()');
    } finally {
      await admin.end();
    }
    await new Promise(done => setTimeout(done, 200)); // let the 'error' event arrive
    const { rows } = await sql<{ n: number }>`select 1 as n`.execute(db);
    expect(rows[0].n).toBe(1);
  });
});

describe('GET /api/health/db', () => {
  let server: Server;
  const start = async (app: ReturnType<typeof createApp>) => {
    server = app.listen(0);
    await new Promise(done => server.once('listening', done));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  const close = () => new Promise<void>(done => server.close(() => done()));

  it('answers ok when the database is reachable', async () => {
    const res = await fetch(`${await start(createApp({ db }))}/api/health/db`);
    await close();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('answers 503 when no database is configured', async () => {
    const res = await fetch(`${await start(createApp())}/api/health/db`);
    await close();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: 'database not configured' });
  });
});
