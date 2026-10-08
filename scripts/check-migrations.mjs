// Checks the migrations on a throwaway database: every one applies, every one rolls back to an empty schema, they apply
// again, and server/db/types.ts is exactly what the generator produces from them.
// Usage: DATABASE_URL=postgres://user:pass@127.0.0.1:5433/ironlog npm run db:check
//
// It never touches the database in DATABASE_URL: it makes, uses and drops a second one called ironlog_migration_check on
// the same server. It refuses to run unless that server is on this machine (localhost), because it rolls back everything.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const SCRATCH = 'ironlog_migration_check';
const MIGRATIONS = 'db/migrations';
const TYPES = 'server/db/types.ts';

const given = process.env.DATABASE_URL;
if (!given) {
  console.error('Set DATABASE_URL to a Postgres server on this machine (the local Docker one is fine).');
  process.exit(2);
}
const url = new URL(given);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
  console.error(`Refusing to run against ${url.hostname}: this check rolls back every migration. Use a local Postgres.`);
  process.exit(2);
}
url.searchParams.set('sslmode', 'disable');
const scratch = new URL(url);
scratch.pathname = `/${SCRATCH}`;
const env = { ...process.env, DATABASE_URL: scratch.href, DBMATE_NO_DUMP_SCHEMA: 'true', DBMATE_MIGRATIONS_DIR: MIGRATIONS };

const run = (cmd, args) => execFileSync('npx', [cmd, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
const dbmate = (...args) => run('dbmate', args);
const count = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).length;

const tables = async () => {
  const client = new pg.Client({ connectionString: scratch.href });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name <> 'schema_migrations' order by 1`);
    const fns = await client.query(`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
    return { tables: rows.map(r => r.table_name), functions: fns.rows.map(r => r.proname) };
  } finally {
    await client.end();
  }
};

let failed = false;
const step = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) failed = true;
};

dbmate('drop');
dbmate('create');
const tmp = mkdtempSync(join(tmpdir(), 'ironlog-types-'));
try {
  dbmate('up');
  const up = await tables();
  step(`${count} migrations apply`, up.tables.length > 0, `${up.tables.length} tables`);

  // The types file is generated; it must match what the migrations produce, so a schema change cannot ship without it.
  const generated = join(tmp, 'types.ts');
  run('kysely-codegen', ['--dialect', 'postgres', '--date-parser', 'string', '--exclude-pattern', 'schema_migrations', '--out-file', generated]);
  const same = readFileSync(generated, 'utf8') === readFileSync(TYPES, 'utf8');
  step(`${TYPES} matches the migrations`, same, same ? '' : 'run npm run db:types with the local database and commit the result');

  for (let i = 0; i < count; i++) dbmate('down');
  const down = await tables();
  step('rolling every migration back leaves an empty schema', down.tables.length === 0 && down.functions.length === 0,
    `tables left: [${down.tables.join(', ')}], functions left: [${down.functions.join(', ')}]`);

  dbmate('up');
  const again = await tables();
  step('they apply again after a full rollback', JSON.stringify(again) === JSON.stringify(up));
} catch (err) {
  console.error(err.stderr || err.message || err);
  failed = true;
} finally {
  rmSync(tmp, { recursive: true, force: true });
  try { dbmate('drop'); } catch { /* the scratch database is gone or never existed */ }
}
process.exit(failed ? 1 : 0);
