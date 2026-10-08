// Runs the end-to-end sync tests (playwright.sync.config.js) against a scratch database that this script makes and drops.
// Usage: DATABASE_URL=postgres://user:pass@127.0.0.1:5433/ironlog npm run e2e:sync [-- playwright args]
// It never touches the database in DATABASE_URL, only a second one called ironlog_e2e on the same server, and it refuses a
// server that is not on this machine (a developer's .env points at Neon; the tests create users and rows).
import { execFileSync, spawnSync } from 'node:child_process';
import pg from 'pg';

const SCRATCH = 'ironlog_e2e';
// The API connects as this login, which inherits the restricted role from migration 009 (ironlog_app), so row-level security applies to
// the whole run. A separate login, rather than giving ironlog_app a password, leaves whatever password an operator set on it alone.
const APP_LOGIN = 'ironlog_e2e_app';
const APP_PASSWORD = 'e2e-app-password';
const given = process.env.DATABASE_URL;
if (!given) {
  console.error('Set DATABASE_URL to a Postgres server on this machine (the local Docker one is fine).');
  process.exit(2);
}
const url = new URL(given);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
  console.error(`Refusing to run against ${url.hostname}: use a local Postgres.`);
  process.exit(2);
}
url.searchParams.set('sslmode', 'disable');
const scratch = new URL(url);
scratch.pathname = `/${SCRATCH}`;
const env = { ...process.env, DATABASE_URL: scratch.href, DBMATE_NO_DUMP_SCHEMA: 'true', DBMATE_MIGRATIONS_DIR: 'db/migrations' };
const dbmate = (...args) => execFileSync('npx', ['dbmate', ...args], { env, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

const maintenance = new URL(scratch);
maintenance.pathname = '/postgres';
const withClient = async (fn, target = scratch) => {
  const client = new pg.Client({ connectionString: target.href });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
};
const appUrl = new URL(scratch);
appUrl.username = APP_LOGIN;
appUrl.password = APP_PASSWORD;

let code = 1;
try {
  dbmate('drop');
  dbmate('create');
  dbmate('up');
  await withClient(async c => {
    await c.query(`drop role if exists ${APP_LOGIN}`);
    await c.query(`create role ${APP_LOGIN} login password '${APP_PASSWORD}' in role ironlog_app`);
  });
  const run = spawnSync('npx', ['playwright', 'test', '--config', 'playwright.sync.config.js', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, E2E_DATABASE_URL: scratch.href, E2E_APP_DATABASE_URL: appUrl.href },
  });
  code = run.status ?? 1;
} catch (err) {
  console.error(err.stderr || err.message || err);
} finally {
  try { dbmate('drop'); } catch { /* the scratch database is gone or never existed */ }
  // Roles belong to the whole server, and only a database that is gone can no longer depend on this one.
  try { await withClient(c => c.query(`drop role if exists ${APP_LOGIN}`), maintenance); } catch { /* nothing to clean up */ }
}
process.exit(code);
