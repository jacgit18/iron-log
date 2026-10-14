import { execFile } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sql, type Kysely } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDatabase } from './test/postgres.ts';
import type { DB } from './db/types.ts';

// The deploy's migration check (scripts/db-pending.mjs) and the read-only login it uses (scripts/db-reader.mjs), against a real
// Postgres with the real migrations applied: the login sees which migrations ran, and nothing else.
const node = (script: string, env: Record<string, string>) =>
  new Promise<{ status: number; stdout: string; stderr: string }>(done => {
    execFile('node', [resolve('scripts', script)], { env: { ...process.env, DATABASE_URL: '', MIGRATIONS_CHECK_URL: '', ...env }, encoding: 'utf8' }, (err, stdout, stderr) =>
      done({ status: err ? Number((err as { code?: number }).code ?? 1) : 0, stdout, stderr }));
  });
const asReader = async <T>(url: string, fn: (c: pg.Client) => Promise<T>) => {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
};

let owner: Kysely<DB>;
let ownerUrl: string;
let stop: () => Promise<void>;
let reader: string;
let extra: string; // a migrations folder with one file the database has not applied

beforeAll(async () => {
  ({ db: owner, url: ownerUrl, stop } = await startTestDatabase());
  const made = await node('db-reader.mjs', { DATABASE_URL: ownerUrl });
  expect(made.status).toBe(0);
  reader = made.stdout;
  extra = mkdtempSync(join(tmpdir(), 'migrations-'));
  for (const f of readdirSync('db/migrations')) copyFileSync(join('db/migrations', f), join(extra, f));
  writeFileSync(join(extra, '20991231000001_later.sql'), '-- migrate:up\n-- migrate:down\n');
}, 120_000);
afterAll(async () => { rmSync(extra, { recursive: true, force: true }); await stop(); });

describe('the read-only login', () => {
  it('is the migrations_reader role on the same database, printed and nothing else', () => {
    const u = new URL(reader);
    expect(u.username).toBe('migrations_reader');
    expect(u.password.length).toBeGreaterThanOrEqual(30);
    expect(`${u.host}${u.pathname}`).toBe(`${new URL(ownerUrl).host}${new URL(ownerUrl).pathname}`);
  });
  it('reads schema_migrations, and no user data', async () => {
    await asReader(reader, async c => {
      expect((await c.query('select count(*)::int as n from schema_migrations')).rows[0].n).toBeGreaterThan(10);
      for (const t of ['users', 'log_entries', 'list_items', 'grocery_months']) await expect(c.query(`select 1 from ${t} limit 1`)).rejects.toThrow(/permission denied/);
    });
  });
  it('cannot write, even to schema_migrations, or call the erase functions', async () => {
    await asReader(reader, async c => {
      await expect(c.query(`insert into schema_migrations (version) values ('1')`)).rejects.toThrow(/read-only|permission denied/);
      await expect(c.query('create table x (a int)')).rejects.toThrow(/read-only|permission denied/);
      await expect(c.query('select erase_my_data()')).rejects.toThrow(/permission denied/);
    });
  });
  it('making it again gives a new password and the old one stops working', async () => {
    const again = await node('db-reader.mjs', { DATABASE_URL: ownerUrl });
    expect(again.status).toBe(0);
    await expect(asReader(reader, c => c.query('select 1'))).rejects.toThrow(/password/);
    reader = again.stdout;
    await asReader(reader, c => c.query('select 1'));
  });
});

describe('db-pending.mjs', () => {
  it('says nothing waits when the database has every migration', async () => {
    expect(await node('db-pending.mjs', { MIGRATIONS_CHECK_URL: reader })).toMatchObject({ status: 0, stdout: '' });
  });
  it('lists a file the database has not applied, and exits 3', async () => {
    const r = await node('db-pending.mjs', { MIGRATIONS_CHECK_URL: reader, MIGRATIONS_DIR: extra });
    expect(r.status).toBe(3);
    expect(r.stdout.trim()).toBe(`${extra}/20991231000001_later.sql`);
  });
  it('sees a migration the database lost track of, whatever the commits say', async () => {
    const last = readdirSync('db/migrations').sort().at(-1)!;
    const version = last.slice(0, last.indexOf('_'));
    await sql`delete from schema_migrations where version = ${version}`.execute(owner);
    try {
      const r = await node('db-pending.mjs', { MIGRATIONS_CHECK_URL: reader });
      expect(r.status).toBe(3);
      expect(r.stdout.trim()).toBe(`db/migrations/${last}`);
    } finally {
      await sql`insert into schema_migrations (version) values (${version})`.execute(owner);
    }
  });
  it('exits 2 when it cannot tell, and never prints the URL or its password', async () => {
    expect((await node('db-pending.mjs', {})).status).toBe(2);
    const wrong = new URL(reader); wrong.password = 'not-the-password-xyz';
    const r = await node('db-pending.mjs', { MIGRATIONS_CHECK_URL: wrong.href });
    expect(r.status).toBe(2);
    expect(r.stdout + r.stderr).not.toContain('not-the-password-xyz');
    expect(r.stdout + r.stderr).not.toContain(new URL(reader).password);
  });
});
