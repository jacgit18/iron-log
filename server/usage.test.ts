import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { USAGE_EVENTS, type UsageOverview } from '../src/shared/usage.ts';
import { createApp } from './app.ts';
import { createDb } from './db/connection.ts';
import type { DB } from './db/types.ts';
import { installHash, parseUsage, usageKeyFrom } from './usage.ts';
import { parseDays } from './usageRoutes.ts';
import { startTestDatabase } from './test/postgres.ts';

// Opt-in anonymous usage counts (brief opt-in-usage-counts): the shape check, the database functions, the public route and the admin read.
const ID = '3f2b8c1e-5d4a-4b7e-9c10-2a6d8e4f0b11';
const good = { id: ID, version: '1791448234', fromApp: false, counts: { app_open: 1, workout_logged: 3 } };

describe('parseUsage', () => {
  it('accepts exactly the shape a phone sends', () => {
    expect(parseUsage(good)).toEqual(good);
    expect(parseUsage({ ...good, counts: {} })).toMatchObject({ counts: {} });
  });

  it('refuses any other key, event name, id, version or count', () => {
    const bad: unknown[] = [
      null, 'x', [], {},
      { ...good, email: 'a@b.c' },
      { ...good, id: 'not-a-uuid' },
      { ...good, id: ID.toUpperCase() },
      { ...good, version: 'v'.repeat(21) },
      { ...good, version: 'a b' },
      { ...good, fromApp: 'yes' },
      { ...good, counts: [] },
      { ...good, counts: { sneaky: 1 } },
      { ...good, counts: { app_open: -1 } },
      { ...good, counts: { app_open: 1001 } },
      { ...good, counts: { app_open: 1.5 } },
      { ...good, counts: { app_open: '1' } },
    ];
    for (const body of bad) expect(parseUsage(body)).toBeNull();
  });
});

describe('install hash', () => {
  it('is stable for one id and key, differs across ids and keys, and never contains the id', () => {
    const key = usageKeyFrom('secret-a')!;
    expect(installHash(key, ID)).toBe(installHash(key, ID));
    expect(installHash(key, ID)).not.toBe(installHash(key, ID.replace('3f', '3e')));
    expect(installHash(usageKeyFrom('secret-b')!, ID)).not.toBe(installHash(key, ID));
    expect(installHash(key, ID)).toMatch(/^[0-9a-f]{64}$/);
    expect(usageKeyFrom(undefined)).toBeUndefined();
    expect(usageKeyFrom('')).toBeUndefined();
  });
});

describe('parseDays', () => {
  it('defaults to 30 and accepts 1 to 90', () => {
    expect(parseDays({})).toBe(30);
    expect(parseDays({ days: '1' })).toBe(1);
    expect(parseDays({ days: '90' })).toBe(90);
    for (const days of ['0', '91', 'x', '1.5', '-3', ['3']]) expect(parseDays({ days })).toBeNull();
  });
});

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
beforeEach(async () => {
  await owner.deleteFrom('usage_days').execute();
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => new Promise<void>(done => (server ? server.close(() => done()) : done())));

const H = (n: number) => n.toString(16).padStart(64, '0');
const record = (hash = H(1), counts: object = { app_open: 1 }, version = '10', fromApp = false) =>
  sql<{ record_usage: string }>`select record_usage(${hash}, ${version}, ${fromApp}, ${JSON.stringify(counts)}::jsonb) as record_usage`.execute(app).then(r => r.rows[0]!.record_usage);
const rows = () => owner.selectFrom('usage_days').selectAll().orderBy('day').execute();
const ago = (n: number) => sql<string>`((now() at time zone 'utc')::date - ${n}::int)`;
const seed = (hash: string, daysAgo: number, counts: object = { app_open: 1 }, version = '10', fromApp = false) =>
  owner.insertInto('usage_days').values({ install_hash: hash, day: ago(daysAgo) as unknown as string, version, from_app: fromApp, counts: JSON.stringify(counts) }).execute();

describe('record_usage', () => {
  it('stores one row per install per day and adds a second send to the first, capped at 1000', async () => {
    expect(await record(H(1), { app_open: 1, workout_logged: 4 })).toBe('ok');
    expect(await record(H(1), { app_open: 1, export_used: 2, workout_logged: 999 })).toBe('ok');
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]!.counts).toEqual({ app_open: 2, export_used: 2, workout_logged: 1000 });
    await record(H(2));
    expect(await rows()).toHaveLength(2);
  });

  it('keeps the newest version and remembers that any send came from the Android app', async () => {
    await record(H(1), { app_open: 1 }, '10', true);
    await record(H(1), { app_open: 1 }, '11', false);
    expect(await rows()).toMatchObject([{ version: '11', from_app: true }]);
  });

  it('accepts every counter the phone can send, and nothing else', async () => {
    for (const name of USAGE_EVENTS) expect(await record(H(3), { [name]: 1 })).toBe('ok');
    for (const counts of [{ sneaky: 1 }, { app_open: 'x' }, { app_open: -1 }, { app_open: 10000 }, { app_open: 1.5 }, []]) {
      await expect(record(H(4), counts)).rejects.toThrow();
    }
    await expect(record('not-a-hash')).rejects.toThrow();
    await expect(record(H(0xabc).toUpperCase())).rejects.toThrow();
  });

  it('drops rows older than 90 days as new rows arrive', async () => {
    await seed(H(9), 120);
    await seed(H(8), 89);
    await record(H(1));
    expect((await rows()).map(r => r.install_hash).sort()).toEqual([H(1), H(8)]);
  });

  it('refuses a new install at 200,000 rows but keeps counting one it already has', async () => {
    await sql`insert into usage_days (install_hash, day, counts) select lpad(to_hex(g), 64, '0'), (now() at time zone 'utc')::date, '{"app_open":1}'::jsonb from generate_series(10, 200009) g`.execute(owner);
    expect(await record(H(1))).toBe('full');
    expect(await record(H(10))).toBe('ok');
    expect((await owner.selectFrom('usage_days').select(sql<string>`count(*)`.as('n')).executeTakeFirstOrThrow()).n).toBe('200000');
  }, 60_000);

  it('is the only way in for the app role: it cannot read or write the table itself', async () => {
    for (const statement of [sql`select * from usage_days`, sql`insert into usage_days (install_hash, day) values (${H(1)}, now())`, sql`update usage_days set version = 'x'`, sql`delete from usage_days`]) {
      await expect(statement.execute(app)).rejects.toThrow(/permission denied/);
    }
  });

  it('has no column that could name a person', async () => {
    const cols = await sql<{ column_name: string }>`select column_name from information_schema.columns where table_name = 'usage_days' order by 1`.execute(owner);
    expect(cols.rows.map(c => c.column_name)).toEqual(['counts', 'day', 'from_app', 'install_hash', 'version']);
  });
});

async function start(opts: { admins?: string[]; usageKey?: string | undefined } = {}) {
  server = createApp({ db: app, admins: new Set(opts.admins ?? []), usageKey: 'usageKey' in opts ? opts.usageKey : usageKeyFrom('test-secret'), limits: { usage: { max: 3, windowMs: 60_000 } } }).listen(0);
  await new Promise(done => server!.once('listening', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: unknown) => fetch(`${base}/api/usage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const admin = (who: string, path = '') => fetch(`${base}/api/usage-admin${path}`, { headers: { 'x-dev-user': who } });
  const makeAdmin = async (who: string, flag = true) => {
    await fetch(`${base}/api/me`, { headers: { 'x-dev-user': who } });
    await owner.updateTable('users').set({ is_admin: flag }).where('auth_user_id', '=', `dev:${who}`).execute();
  };
  return { post, admin, makeAdmin };
}

describe('POST /api/usage', () => {
  it('stores a valid report without a sign-in, keeping only a hash of the install id', async () => {
    const { post } = await start();
    expect((await post(good)).status).toBe(204);
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]!.install_hash).toBe(installHash(usageKeyFrom('test-secret')!, ID));
    expect(JSON.stringify(r)).not.toContain(ID);
    expect(r[0]!.counts).toEqual(good.counts);
  });

  it('answers 422 to anything that is not exactly a report and stores nothing', async () => {
    const { post } = await start();
    expect((await post({ ...good, email: 'a@b.c' })).status).toBe(422);
    expect((await post({ ...good, counts: { sneaky: 1 } })).status).toBe(422);
    expect(await rows()).toHaveLength(0);
  });

  it('answers 503 without a key, and rate-limits a loop', async () => {
    const off = await start({ usageKey: undefined });
    expect((await off.post(good)).status).toBe(503);
    await new Promise<void>(done => server!.close(() => done()));
    const { post } = await start();
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await post(good)).status);
    expect(statuses).toEqual([204, 204, 204, 429, 429]);
  });
});

describe('GET /api/usage-admin (two locks)', () => {
  it('refuses a user who is not on the admin list, and one on the list whose database flag is off', async () => {
    const { admin, makeAdmin } = await start({ admins: ['dev:boss'] });
    await makeAdmin('guest');
    expect((await admin('guest')).status).toBe(403);
    await makeAdmin('boss', false);
    expect((await admin('boss')).status).toBe(403);
  });

  it('answers 422 for a bad days value', async () => {
    const { admin, makeAdmin } = await start({ admins: ['dev:boss'] });
    await makeAdmin('boss');
    expect((await admin('boss', '?days=0')).status).toBe(422);
  });

  it('shows installs per day, day 1, 7 and 14 return, and feature totals per version', async () => {
    const { admin, makeAdmin } = await start({ admins: ['dev:boss'] });
    await makeAdmin('boss');
    // A: first seen 20 days ago, came back day 1 and day 7 but not day 14. B: first seen 8 days ago, back on day 1 only. C: first seen today, from the app.
    await seed(H(1), 20, { app_open: 1, workout_logged: 2 }, '10');
    await seed(H(1), 19, { app_open: 1 }, '10');
    await seed(H(1), 13, { app_open: 1 }, '11');
    await seed(H(2), 8, { app_open: 1 }, '11');
    await seed(H(2), 7, { app_open: 1, workout_logged: 5 }, '11');
    await seed(H(3), 0, { app_open: 1, export_used: 1 }, '11', true);
    const body = (await (await admin('boss', '?days=30')).json()) as UsageOverview & { ok: boolean };
    expect(body.ok).toBe(true);
    expect(body.installs).toBe(3);
    expect(body.days[0]).toMatchObject({ installs: 1, fromApp: 1 }); // today, newest first
    expect(body.retention).toEqual([
      { after: 1, eligible: 2, returned: 2 }, // A and B were seen at least 1 day ago and both returned the next day
      { after: 7, eligible: 2, returned: 1 }, // A is back on day 7 (13 days ago); B has no row 7 days after its first
      { after: 14, eligible: 1, returned: 0 }, // only A is 14 days old; no row 14 days after its first day
    ]);
    expect(body.features).toContainEqual({ version: '11', event: 'workout_logged', total: 5 });
    expect(body.features).toContainEqual({ version: '10', event: 'workout_logged', total: 2 });
    expect(body.features).toContainEqual({ version: '11', event: 'export_used', total: 1 });
  });
});
