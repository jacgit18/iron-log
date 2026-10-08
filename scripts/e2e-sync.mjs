// Runs the end-to-end sync tests (playwright.sync.config.js) against a scratch database that this script makes and drops.
// Usage: DATABASE_URL=postgres://user:pass@127.0.0.1:5433/ironlog npm run e2e:sync [-- playwright args]
// It never touches the database in DATABASE_URL, only a second one called ironlog_e2e on the same server, and it refuses a
// server that is not on this machine (a developer's .env points at Neon; the tests create users and rows).
import { execFileSync, spawnSync } from 'node:child_process';

const SCRATCH = 'ironlog_e2e';
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

let code = 1;
try {
  dbmate('drop');
  dbmate('create');
  dbmate('up');
  const run = spawnSync('npx', ['playwright', 'test', '--config', 'playwright.sync.config.js', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, E2E_DATABASE_URL: scratch.href },
  });
  code = run.status ?? 1;
} catch (err) {
  console.error(err.stderr || err.message || err);
} finally {
  try { dbmate('drop'); } catch { /* the scratch database is gone or never existed */ }
}
process.exit(code);
