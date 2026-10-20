import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { sql, type Kysely } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DB } from './db/types.ts';
import { startTestDatabase } from './test/postgres.ts';

// scripts/qa-db.mjs against a real Postgres with the real migrations (ADR 060): the QA database is emptied of user data, keeps its schema
// and the exercise catalog, and carries the mark the QA workflow checks before it migrates anything.
// PROD_DATABASE_URL names some other database: `reset` must know which one is production to refuse it. `env` overrides it per test.
const OTHER_PRODUCTION = 'postgres://owner:pw@ep-prod-1.example.com/neondb';
const runWith = (env: Record<string, string>, cwd?: string) => (url: string, ...args: string[]) =>
  new Promise<{ status: number; stdout: string; stderr: string }>(done => {
    execFile('node', [resolve('scripts/qa-db.mjs'), ...args], { cwd, env: { ...process.env, PROD_DATABASE_URL: OTHER_PRODUCTION, QA_DATABASE_URL: url, ...env }, encoding: 'utf8' }, (err, stdout, stderr) =>
      done({ status: err ? Number((err as { code?: number }).code ?? 1) : 0, stdout, stderr }));
  });
const run = runWith({});

let db: Kysely<DB>;
let url: string;
let host: string;
let stop: () => Promise<void>;
const count = async (table: string) => Number((await sql<{ n: string }>`select count(*) as n from ${sql.raw(table)}`.execute(db)).rows[0]!.n);

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

describe('qa-db.mjs', () => {
  it('check refuses a database that is not marked as QA', async () => {
    const out = await run(url, 'check');
    expect(out.status).toBe(1);
    expect(out.stderr).toContain('not marked as QA');
  });

  it('reset without --host stops, and with the wrong host changes nothing', async () => {
    expect((await run(url, 'reset', '--apply')).status).toBe(2);
    const wrong = await run(url, 'reset', '--host', 'ep-qa.example.com', '--apply');
    expect(wrong.status).toBe(2);
    expect(wrong.stderr).toContain('does not match');
    expect(await count('auth."session"')).toBe(1);
  });

  it('reset refuses production\'s own address, and refuses when it cannot tell which one is production', async () => {
    const same = await runWith({ PROD_DATABASE_URL: `postgres://owner:pw@${host}/neondb` })(url, 'reset', '--host', host, '--apply');
    expect(same.status).toBe(2);
    expect(same.stderr).toContain("production's database");
    // An empty folder: no .env there to name production either (a developer's own checkout has one).
    const unknown = await runWith({ PROD_DATABASE_URL: '' }, tmpdir())(url, 'reset', '--host', host, '--apply');
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain('Cannot tell which database is production');
    expect(await count('auth."session"')).toBe(1);
  });

  it('a dry run lists the tables it would empty, says what it keeps, and changes nothing', async () => {
    const out = await run(url, 'reset', '--host', host);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('would empty: "auth"."session" (1 rows)');
    expect(out.stdout).toContain('would empty: "public"."users" (1 rows)');
    expect(out.stdout).toContain('keeping: schema_migrations, catalog_items');
    expect(out.stdout).not.toContain('"public"."catalog_items"');
    expect(out.stdout).toContain('Dry run');
    expect(await count('auth."session"')).toBe(1);
    expect((await run(url, 'check')).status).toBe(1);
  });

  it('refuses a database marked as staging', async () => {
    await sql`do $$ begin execute format('comment on database %I is %L', current_database(), 'iron-log staging'); end $$`.execute(db);
    try {
      const out = await run(url, 'reset', '--host', host, '--apply');
      expect(out.status).toBe(2);
      expect(out.stderr).toContain('marked as staging');
      expect(await count('auth."session"')).toBe(1);
    } finally {
      await sql`do $$ begin execute format('comment on database %I is null', current_database()); end $$`.execute(db);
    }
  });

  it('--apply empties the user data, keeps the schema, the migrations record and the catalog, and marks the database', async () => {
    const out = await run(url, 'reset', '--host', host, '--apply');
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('marked as QA');
    for (const table of ['auth."user"', 'auth."session"', 'users', 'push_subscription']) expect(await count(table), table).toBe(0);
    expect(await count('catalog_items')).toBe(1);
    expect(await count('schema_migrations')).toBeGreaterThan(10);
    expect((await run(url, 'check')).status).toBe(0);
  });

  it('--apply makes the QA login a member of ironlog_app with the given password, with the app\'s access and nothing more', async () => {
    const out = await runWith({ QA_APP_PASSWORD: "p'w d" })(url, 'reset', '--host', host, '--apply');
    expect(out.status).toBe(0);
    expect(out.stdout + out.stderr).not.toContain("p'w d");
    const login = new URL(url);
    login.username = 'ironlog_qa';
    login.password = encodeURIComponent("p'w d");
    const client = new pg.Client({ connectionString: login.href });
    await client.connect();
    try {
      expect((await client.query('select count(*)::int as n from auth."user"')).rows[0].n).toBe(0);
      await expect(client.query('create table nope (x int)')).rejects.toThrow();
    } finally {
      await client.end();
    }
    // Run again: nothing to make, nothing breaks.
    expect((await runWith({ QA_APP_PASSWORD: "p'w d" })(url, 'reset', '--host', host, '--apply')).status).toBe(0);
  });

  it('cannot tell without a URL', async () => {
    expect((await run('', 'check')).status).toBe(2);
  });
});
