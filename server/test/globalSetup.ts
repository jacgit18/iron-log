import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

// One Postgres for the whole server-test run. It makes a template database with the real migrations applied once, and each test file
// clones it (server/test/postgres.ts: CREATE DATABASE ... TEMPLATE), which takes milliseconds, instead of starting a container and
// running every migration per file. Why: backlog `dt-check-speed`.
export const TEMPLATE = 'ironlog_template';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Connection string of the shared test Postgres (superuser, the default database), or undefined when no global setup ran. */
    pgBase: string;
  }
}

export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:17').start();
  const base = container.getConnectionUri();
  const admin = new pg.Client({ connectionString: base });
  try {
    await admin.connect();
    await admin.query(`create database ${TEMPLATE}`);
    const tpl = new URL(base);
    tpl.pathname = `/${TEMPLATE}`;
    execFileSync('npx', ['dbmate', '--no-dump-schema', '--migrations-dir', 'db/migrations', '--url', `${tpl.href}?sslmode=disable`, 'up'], { stdio: 'pipe' });
    // The restricted role the API runs as (migration 009) lives in the cluster, not the database, so this once covers every clone.
    await admin.query(`alter role ironlog_app login password 'app-test'`);
  } catch (err) {
    // A broken migration must not leave the container behind (watch mode, or Ryuk turned off), so stop it before the error goes on.
    await admin.end().catch(() => undefined);
    await container.stop().catch(() => undefined);
    throw err;
  }
  await admin.end(); // a template cannot be cloned while anything is connected to it
  project.provide('pgBase', base);
  return async () => { await container.stop(); };
}
