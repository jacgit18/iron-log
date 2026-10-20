import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { sql, type Kysely } from 'kysely';
import pg from 'pg';
import { inject } from 'vitest';
import { createDb } from '../db/connection.ts';
import type { DB } from '../db/types.ts';
import { TEMPLATE } from './globalSetup.ts';

type TestDatabase = { db: Kysely<DB>; url: string; appUrl: string; stop: () => Promise<void> };

// A throwaway database with the real migrations applied (ADR 014). Under Vitest's global setup (server/test/globalSetup.ts) it is a clone
// of one shared template inside one shared Postgres; without it (a file run some other way) it falls back to a container of its own.
export async function startTestDatabase(): Promise<TestDatabase> {
  const base = inject('pgBase');
  return base ? cloneTemplate(base) : startOwnContainer();
}

async function withAdmin<T>(base: string, run: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: base });
  await c.connect();
  try { return await run(c); } finally { await c.end(); }
}

async function cloneTemplate(base: string): Promise<TestDatabase> {
  const name = `t_${randomBytes(6).toString('hex')}`;
  await withAdmin(base, c => c.query(`create database ${name} template ${TEMPLATE}`));
  const u = new URL(base);
  u.pathname = `/${name}`;
  const url = u.href;
  const db = createDb(url);
  const app = new URL(url);
  app.username = 'ironlog_app';
  app.password = 'app-test';
  return {
    db,
    url,
    appUrl: app.href,
    stop: async () => {
      await db.destroy();
      await withAdmin(base, c => c.query(`drop database if exists ${name} with (force)`));
    },
  };
}

async function startOwnContainer(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:17').start();
  const url = container.getConnectionUri();
  execFileSync('npx', ['dbmate', '--no-dump-schema', '--migrations-dir', 'db/migrations', '--url', `${url}?sslmode=disable`, 'up'], { stdio: 'pipe' });
  const db = createDb(url);
  // The restricted role the API runs as in production (migration 009). It has no login until an operator gives it one; here
  // that is done for the test database, so a test can connect as it and see what row-level security allows.
  await sql`alter role ironlog_app login password 'app-test'`.execute(db);
  const app = new URL(url);
  app.username = 'ironlog_app';
  app.password = 'app-test';
  return {
    db,
    url,
    appUrl: app.href,
    stop: async () => {
      await db.destroy();
      await container.stop();
    },
  };
}
