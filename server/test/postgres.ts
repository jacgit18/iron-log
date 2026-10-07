import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { Kysely } from 'kysely';
import { createDb } from '../db/connection.ts';
import type { DB } from '../db/types.ts';

// A throwaway Postgres with the real migrations applied (ADR 014).
export async function startTestDatabase(): Promise<{ db: Kysely<DB>; url: string; stop: () => Promise<void> }> {
  const container = await new PostgreSqlContainer('postgres:17').start();
  const url = container.getConnectionUri();
  execFileSync('npx', ['dbmate', '--no-dump-schema', '--migrations-dir', 'db/migrations', '--url', `${url}?sslmode=disable`, 'up'], { stdio: 'pipe' });
  const db = createDb(url);
  return {
    db,
    url,
    stop: async () => {
      await db.destroy();
      await container.stop();
    },
  };
}
