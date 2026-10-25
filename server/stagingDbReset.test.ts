import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { sql, type Kysely } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DB } from './db/types.ts';
import { startTestDatabase } from './test/postgres.ts';

// scripts/staging-db.mjs `reset` against a real Postgres with the real migrations (backlog EP2, ADRs 056 and 057): staging is emptied of every
// user's data before it gets its own PII key, keeps its schema, the exercise catalog and the staging mark. Its own file and database, so it
// does not depend on the order of the tests in stagingDb.test.ts.
// PROD_DATABASE_URL names some other database: `reset` must know which one is production to refuse it. `env` overrides it per test.
const OTHER_PRODUCTION = 'postgres://owner:pw@ep-prod-1.example.com/neondb';
const runWith = (env: Record<string, string>, cwd?: string) => (url: string, ...args: string[]) =>
  new Promise<{ status: number; stdout: string; stderr: string }>(done => {
    execFile('node', [resolve('scripts/staging-db.mjs'), ...args], { cwd, env: { ...process.env, PROD_DATABASE_URL: OTHER_PRODUCTION, STAGING_DATABASE_URL: url, ...env }, encoding: 'utf8' }, (err, stdout, stderr) =>
      done({ status: err ? Number((err as { code?: number }).code ?? 1) : 0, stdout, stderr }));
  });
const run = runWith({});

let db: Kysely<DB>;
let url: string;
let host: string;
let stop: () => Promise<void>;
const count = async (table: string) => Number((await sql<{ n: string }>`select count(*) as n from ${sql.raw(table)}`.execute(db)).rows[0]!.n);
const mark = (text: string | null) => sql`do $$ begin execute format('comment on database %I is %L', current_database(), ${sql.lit(text)}::text); end $$`.execute(db);

beforeAll(async () => {
  ({ db, url, stop } = await startTestDatabase());
  host = new URL(url).hostname;
  // What a copy of production carries: a user with sign-in rows and data, and the catalog.
  await sql`insert into auth."user" ("id","name","email","emailVerified") values ('u1','n','e@x.co',true)`.execute(db);
  await sql`insert into auth."session" ("id","expiresAt","token","updatedAt","userId") values ('s1', now() + interval '1 day', 'tok', now(), 'u1')`.execute(db);
  const user = await sql<{ id: string }>`insert into users (auth_user_id) values ('u1') returning id`.execute(db);
  await sql`insert into push_subscription (user_id, endpoint, p256dh, auth) values (${user.rows[0]!.id}, 'https://push.example/1', 'k', 'a')`.execute(db);
  await sql`insert into catalog_items (id, kind, source, license, name) values ('c:fedb:squat', 'exercise', 'fedb', 'public domain', 'Squat')`.execute(db);
}, 120_000);
afterAll(async () => { await stop(); });

describe('staging-db.mjs reset', () => {
  it('needs --host, and with the wrong host changes nothing', async () => {
    await mark('iron-log staging');
    expect((await run(url, 'reset', '--apply')).status).toBe(2);
    const wrong = await run(url, 'reset', '--host', 'ep-staging.example.com', '--apply');
    expect(wrong.status).toBe(2);
    expect(wrong.stderr).toContain('does not match');
    expect(await count('auth."session"')).toBe(1);
  });

  it('refuses production\'s own address, and refuses when it cannot tell which one is production', async () => {
    const same = await runWith({ PROD_DATABASE_URL: `postgres://owner:pw@${host}/neondb` })(url, 'reset', '--host', host, '--apply');
    expect(same.status).toBe(2);
    expect(same.stderr).toContain("production's database");
    // An empty folder: no .env there to name production either, and no Secret Manager lookup (a signed-in gcloud would find it).
    const unknown = await runWith({ PROD_DATABASE_URL: '', PROD_URL_LOOKUP: 'off' }, tmpdir())(url, 'reset', '--host', host, '--apply');
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain('Cannot tell which database is production');
    expect(await count('auth."session"')).toBe(1);
  });

  it('refuses a database that is not marked as staging, and one marked as QA', async () => {
    await mark(null);
    const unmarked = await run(url, 'reset', '--host', host, '--apply');
    expect(unmarked.status).toBe(2);
    expect(unmarked.stderr).toContain('not marked as staging');
    expect(unmarked.stderr).toContain('clear');
    await mark('iron-log qa');
    const qa = await run(url, 'reset', '--host', host, '--apply');
    expect(qa.status).toBe(2);
    expect(qa.stderr).toContain('marked as QA');
    expect(await count('auth."session"')).toBe(1);
    await mark('iron-log staging');
  });

  it('a dry run lists the tables and counts, says what it keeps, and changes nothing', async () => {
    const out = await run(url, 'reset', '--host', host);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('would empty: "auth"."session" (1 rows)');
    expect(out.stdout).toContain('would empty: "public"."users" (1 rows)');
    expect(out.stdout).toContain('keeping: schema_migrations, catalog_items');
    expect(out.stdout).toContain('Dry run');
    expect(out.stdout).not.toContain('"catalog_items"');
    expect(await count('auth."user"')).toBe(1);
    expect(await count('users')).toBe(1);
  });

  it('--apply empties the user data, keeps the schema, the migrations record, the catalog and the staging mark', async () => {
    const out = await run(url, 'reset', '--host', host, '--apply');
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('still marked as staging');
    for (const table of ['auth."user"', 'auth."session"', 'users', 'push_subscription']) expect(await count(table), table).toBe(0);
    expect(await count('catalog_items')).toBe(1);
    expect(await count('schema_migrations')).toBeGreaterThan(10);
    expect((await run(url, 'check')).status).toBe(0);
    // Run again: nothing left to empty, nothing breaks.
    expect((await run(url, 'reset', '--host', host, '--apply')).status).toBe(0);
  });

  it('--apply keeps the staging login a member of ironlog_app, with the given password when asked', async () => {
    const out = await runWith({ STAGING_APP_PASSWORD: "p'w d" })(url, 'reset', '--host', host, '--apply');
    expect(out.status).toBe(0);
    expect(out.stdout + out.stderr).not.toContain("p'w d");
    const login = new URL(url);
    login.username = 'ironlog_staging';
    login.password = "p'w d";
    const client = new pg.Client({ connectionString: login.href });
    await client.connect();
    try {
      expect((await client.query('select count(*)::int as n from auth."user"')).rows[0].n).toBe(0);
      await expect(client.query('create table nope (x int)')).rejects.toThrow();
    } finally {
      await client.end();
    }
  });

  it('STAGING_OWNER_PASSWORD gives the owner role a new password, never printed, and the old one stops working', async () => {
    // A throwaway owner (the test database's own login must keep working for the other tests).
    await sql`drop role if exists staging_owner`.execute(db);
    await sql`create role staging_owner superuser login password 'old-owner-pw'`.execute(db);
    try {
      const asOwner = new URL(url);
      asOwner.username = 'staging_owner';
      asOwner.password = 'old-owner-pw';
      const out = await runWith({ STAGING_OWNER_PASSWORD: 'new-owner-pw' })(asOwner.href, 'reset', '--host', host, '--apply');
      expect(out.status).toBe(0);
      expect(out.stdout).toContain('rotating: the owner role');
      expect(out.stdout + out.stderr).not.toContain('new-owner-pw');
      const connectWith = async (password: string) => {
        const c = new pg.Client({ connectionString: Object.assign(new URL(asOwner.href), { password }).href });
        await c.connect();
        await c.end();
      };
      await expect(connectWith('new-owner-pw')).resolves.toBeUndefined();
      await expect(connectWith('old-owner-pw')).rejects.toThrow();
      expect((await run(url, 'reset', '--host', host)).stdout).toContain('not asked');
    } finally {
      await sql`drop role if exists staging_owner`.execute(db);
    }
  });

  it('never prints the connection string', async () => {
    const out = await run(url, 'reset', '--host', host);
    expect(out.stdout + out.stderr).not.toContain(new URL(url).password);
  });
});
