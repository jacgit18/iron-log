#!/usr/bin/env node
// Staging database chores (ADRs 055 and 056). Staging is a Neon branch copied from production, so it starts with real sessions, stored
// Google tokens and push subscriptions; this clears them and marks the database as staging. The deploy workflow's staging job will not
// migrate a database without the mark, so a wrong connection string cannot reach production.
//
//   STAGING_DATABASE_URL=<owner URL of the staging branch> node scripts/staging-db.mjs <command>
//
//   check                       exit 0 when the database carries the staging mark, 1 when it does not, 2 when it cannot be read.
//   clear --host <host> [--apply]
//                               the cleaning after a copy (or a reset from the parent). Without --apply: prints what it would clear and
//                               changes nothing. With --apply, in one transaction: deletes the sessions, one-time codes and push
//                               subscriptions, blanks the stored Google tokens (the account rows stay), makes the app's login ironlog_staging a
//                               member of ironlog_app (every grant and row-level-security policy names ironlog_app, so the staging login has the
//                               same access and later migrations reach it too), and sets the staging mark. With STAGING_APP_PASSWORD set it also
//                               gives ironlog_staging that password (the one in the staging APP_DATABASE_URL); the password is never printed.
//                               --host must be the host in the URL (typed on purpose, to catch a mistyped one). It also refuses when that host is
//                               production's: PROD_DATABASE_URL, or else DATABASE_URL_UNPOOLED from .env, as scripts/prod-db.sh reads it. With
//                               neither set it refuses too, because it could not tell. `check` needs neither.
//
//   reset --host <host> [--apply]
//                               empties staging of every user's data (the step before staging gets its own PII key, backlog EP2): without
//                               --apply it lists the tables and row counts and changes nothing. With --apply, in one transaction: truncates
//                               every table in the public and auth schemas except schema_migrations and the exercise catalog (catalog_items),
//                               restarts their counters, keeps the staging login ironlog_staging a member of ironlog_app (STAGING_APP_PASSWORD
//                               sets its password) and keeps the staging mark. With STAGING_OWNER_PASSWORD set it also gives the role it is
//                               connected as (the owner) that new password. Same guards as `clear` (--host typed on purpose, production's
//                               host refused), and it refuses a database that is not marked as staging (run `clear` first) or is marked QA.
//                               Run it BEFORE the staging service restarts on its own key: rows sealed with production's key cannot be
//                               opened with another one. Staging is not copied from production again; "fresh" means `reset`.
//
// The URL is never printed. Run `clear` by hand after staging is made from a production branch (the mark and the login are lost then); `reset` keeps both.
import { applyAppRole, connect, fail, guardHost, KEEP_TABLES, readMark, rotateOwnerPassword, setMark, userTables } from './lib/db-script.mjs';

const MARKER = 'iron-log staging';

// What `clear` touches: a statement to count and a statement to change, per table.
const STEPS = [
  { what: 'sessions', count: 'select count(*)::int as n from auth."session"', change: 'delete from auth."session"' },
  { what: 'one-time codes and verifications', count: 'select count(*)::int as n from auth."verification"', change: 'delete from auth."verification"' },
  { what: 'push subscriptions', count: 'select count(*)::int as n from push_subscription', change: 'delete from push_subscription' },
  {
    what: 'accounts with a stored token or password',
    count: 'select count(*)::int as n from auth."account" where "accessToken" is not null or "refreshToken" is not null or "idToken" is not null or "password" is not null',
    change: 'update auth."account" set "accessToken" = null, "refreshToken" = null, "idToken" = null, "accessTokenExpiresAt" = null, "refreshTokenExpiresAt" = null, "password" = null where "accessToken" is not null or "refreshToken" is not null or "idToken" is not null or "password" is not null',
  },
];

const APP_ROLE = 'ironlog_staging';
const QA_MARKER = 'iron-log qa';

async function check(client) {
  const mark = await readMark(client);
  if (mark === MARKER) { console.log('This database is marked as staging.'); return 0; }
  console.error('This database is not marked as staging. Run: node scripts/staging-db.mjs clear --host <host> --apply');
  return 1;
}

async function clear(client, url, apply) {
  const actual = new URL(url).hostname;
  console.log(`database host: ${actual}`);
  for (const step of STEPS) console.log(`${apply ? 'clearing' : 'would clear'}: ${(await client.query(step.count)).rows[0].n} ${step.what}`);
  console.log(`${apply ? 'setting up' : 'would set up'}: login ${APP_ROLE} as a member of ironlog_app${process.env.STAGING_APP_PASSWORD ? ', with the password from STAGING_APP_PASSWORD' : ' (no password: set STAGING_APP_PASSWORD to give it one)'}`);
  if (!apply) { console.log('Dry run. Add --apply to clear these and mark the database as staging.'); return 0; }
  try {
    await client.query('begin');
    for (const step of STEPS) await client.query(step.change);
    await applyAppRole(client, APP_ROLE, 'STAGING_APP_PASSWORD');
    await setMark(client, MARKER);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => {});
    fail(`Nothing was changed: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log('Cleared, and the database is marked as staging.');
  return 0;
}

async function reset(client, url, apply) {
  console.log(`database host: ${new URL(url).hostname}`);
  const mark = await readMark(client);
  if (mark === QA_MARKER) fail('This database is marked as QA, not staging. Nothing was changed.');
  if (mark !== MARKER) fail('This database is not marked as staging. Run `clear` first: node scripts/staging-db.mjs clear --host <host> --apply. Nothing was changed.');
  const tables = await userTables(client);
  for (const t of tables) console.log(`${apply ? 'emptying' : 'would empty'}: ${t} (${(await client.query(`select count(*)::int as n from ${t}`)).rows[0].n} rows)`);
  console.log(`keeping: ${KEEP_TABLES.join(', ')}`);
  console.log(`${apply ? 'setting up' : 'would set up'}: login ${APP_ROLE} as a member of ironlog_app${process.env.STAGING_APP_PASSWORD ? ', with the password from STAGING_APP_PASSWORD' : ' (no password: set STAGING_APP_PASSWORD to give it one)'}`);
  console.log(`${apply ? 'rotating' : 'would rotate'}: the owner role's password${process.env.STAGING_OWNER_PASSWORD ? ', to the one in STAGING_OWNER_PASSWORD' : ' (not asked: set STAGING_OWNER_PASSWORD to change it)'}`);
  if (!apply) { console.log('Dry run. Add --apply to empty these.'); return 0; }
  try {
    await client.query('begin');
    if (tables.length) await client.query(`truncate table ${tables.join(', ')} restart identity cascade`);
    await applyAppRole(client, APP_ROLE, 'STAGING_APP_PASSWORD');
    await rotateOwnerPassword(client, 'STAGING_OWNER_PASSWORD');
    await setMark(client, MARKER);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => {});
    fail(`Nothing was changed: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log('Emptied; the database is still marked as staging.');
  return 0;
}

const [, , cmd, ...args] = process.argv;
const url = process.env.STAGING_DATABASE_URL;
if (!url) fail('No STAGING_DATABASE_URL: set it to the owner URL of the staging branch.');
if (cmd !== 'check' && cmd !== 'clear' && cmd !== 'reset') fail('Usage: staging-db.mjs check | clear --host <host> [--apply] | reset --host <host> [--apply]');
const hostIndex = args.indexOf('--host');
const host = hostIndex >= 0 ? args[hostIndex + 1] : undefined;
if (cmd !== 'check' && !host) fail(`${cmd} needs --host <the host in STAGING_DATABASE_URL>.`);
if (cmd !== 'check') await guardHost(url, host, 'STAGING_DATABASE_URL');
const client = await connect(url, 'STAGING');
let code = 2;
try {
  code = cmd === 'check' ? await check(client) : await (cmd === 'reset' ? reset : clear)(client, url, args.includes('--apply'));
} catch (e) {
  // An error after the connect (the connection drops, the compute restarts) must not leave as an uncaught exception: Node exits 1 for that,
  // which `check` documents as "not marked as staging".
  console.error(`Cannot read the database: ${e instanceof Error ? e.message : String(e)}`);
  code = 2;
} finally {
  await client.end().catch(() => {});
}
process.exit(code);
