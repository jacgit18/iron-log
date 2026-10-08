import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { sql, type Kysely } from 'kysely';
import { createDb } from '../db/connection.ts';
import type { DB } from '../db/types.ts';

// A throwaway Postgres with the real migrations applied (ADR 014).
export async function startTestDatabase(): Promise<{ db: Kysely<DB>; url: string; appUrl: string; stop: () => Promise<void> }> {
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
