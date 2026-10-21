#!/usr/bin/env node
// QA database chores (ADR 060). The QA database is a Neon branch made from production and then emptied of every user's data, so QA holds no
// real users' data. The QA workflow (.github/workflows/deploy-qa.yml) will not migrate a database without the QA mark this script sets.
//
//   QA_DATABASE_URL=<owner URL of the QA branch> node scripts/qa-db.mjs <command>
//
//   check                       exit 0 when the database carries the QA mark, 1 when it does not, 2 when it cannot be read.
//   reset --host <host> [--apply]
//                               empties the database of user data after a copy (or a reset from the parent). Without --apply: lists what it
//                               would empty and changes nothing. With --apply, in one transaction: truncates every table in the public and
//                               auth schemas except schema_migrations and the exercise catalog (catalog_items) and restarts their counters,
//                               makes the app's login ironlog_qa a member of ironlog_app (as ADR 055 does for staging), and sets the QA mark.
//                               With QA_APP_PASSWORD set it also gives ironlog_qa that password (the one in the QA APP_DATABASE_URL); the
//                               password is never printed. A branch copies its parent's roles with their passwords, so the owner role here
//                               has production's owner password: with QA_OWNER_PASSWORD set, `reset` also gives the role it is connected as
//                               (the owner) that new password, and the QA_DATABASE_URL secret should be built with it (the old one stops
//                               working). The schema stays as the branch has it; the QA workflow applies migrations.
//                               --host must be the host in the URL (typed on purpose). It also refuses production's host (PROD_DATABASE_URL, or
//                               else DATABASE_URL_UNPOOLED from .env; with neither it refuses, because it could not tell) and a database
//                               already marked as staging.
//
// The URL is never printed. Run `reset` by hand whenever QA is made or reset from its parent (the mark and the login are lost on a reset).
import { applyAppRole, connect, fail, guardHost, readMark, setMark } from './lib/db-script.mjs';

const MARKER = 'iron-log qa';
const STAGING_MARKER = 'iron-log staging';
const APP_ROLE = 'ironlog_qa';
// Not user data: dbmate's record of applied migrations, and the exercise, stretch and supplement catalog (imported, not made by users).
const KEEP = ['schema_migrations', 'catalog_items'];

async function userTables(client) {
  const { rows } = await client.query(
    `select table_schema as s, table_name as t from information_schema.tables
      where table_type = 'BASE TABLE' and table_schema in ('public', 'auth') and table_name <> all($1) order by 1, 2`, [KEEP]);
  return rows.map(r => `"${r.s}"."${r.t}"`);
}

async function check(client) {
  if ((await readMark(client)) === MARKER) { console.log('This database is marked as QA.'); return 0; }
  console.error('This database is not marked as QA. Run: node scripts/qa-db.mjs reset --host <host> --apply');
  return 1;
}

async function reset(client, url, apply) {
  console.log(`database host: ${new URL(url).hostname}`);
  // Staging holds a copy of production's data; emptying it from here would be a mistake, whatever the URL was.
  if ((await readMark(client)) === STAGING_MARKER) fail('This database is marked as staging, not QA. Nothing was changed.');
  const tables = await userTables(client);
  for (const t of tables) console.log(`${apply ? 'emptying' : 'would empty'}: ${t} (${(await client.query(`select count(*)::int as n from ${t}`)).rows[0].n} rows)`);
  console.log(`keeping: ${KEEP.join(', ')}`);
  console.log(`${apply ? 'setting up' : 'would set up'}: login ${APP_ROLE} as a member of ironlog_app${process.env.QA_APP_PASSWORD ? ', with the password from QA_APP_PASSWORD' : ' (no password: set QA_APP_PASSWORD to give it one)'}`);
  console.log(`${apply ? 'rotating' : 'would rotate'}: the owner role's password${process.env.QA_OWNER_PASSWORD ? ', to the one in QA_OWNER_PASSWORD' : ' (not asked: set QA_OWNER_PASSWORD, otherwise the owner password is still production\'s)'}`);
  if (!apply) { console.log('Dry run. Add --apply to empty these and mark the database as QA.'); return 0; }
  try {
    await client.query('begin');
    if (tables.length) await client.query(`truncate table ${tables.join(', ')} restart identity cascade`);
    await applyAppRole(client, APP_ROLE, 'QA_APP_PASSWORD');
    if (process.env.QA_OWNER_PASSWORD) {
      const { rows } = await client.query("select format('alter role %I password %L', current_user, $1::text) as q", [process.env.QA_OWNER_PASSWORD]);
      await client.query(rows[0].q);
    }
    await setMark(client, MARKER);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => {});
    fail(`Nothing was changed: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log('Emptied, and the database is marked as QA.');
  return 0;
}

const [, , cmd, ...args] = process.argv;
const url = process.env.QA_DATABASE_URL;
if (!url) fail('No QA_DATABASE_URL: set it to the owner URL of the QA branch.');
if (cmd !== 'check' && cmd !== 'reset') fail('Usage: qa-db.mjs check | reset --host <host> [--apply]');
const hostIndex = args.indexOf('--host');
const host = hostIndex >= 0 ? args[hostIndex + 1] : undefined;
if (cmd === 'reset' && !host) fail('reset needs --host <the host in QA_DATABASE_URL>.');
if (cmd === 'reset') await guardHost(url, host, 'QA_DATABASE_URL');
const client = await connect(url, 'QA');
let code = 2;
try {
  code = cmd === 'check' ? await check(client) : await reset(client, url, args.includes('--apply'));
} catch (e) {
  // An error after the connect (the connection drops, the compute restarts) must not leave as an uncaught exception: Node exits 1 for that,
  // which `check` documents as "not marked as QA".
  console.error(`Cannot read the database: ${e instanceof Error ? e.message : String(e)}`);
  code = 2;
} finally {
  await client.end().catch(() => {});
}
process.exit(code);
