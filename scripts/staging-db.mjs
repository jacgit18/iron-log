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
// The URL is never printed. Run `clear` by hand each time staging is made or reset from production (the mark is lost on a reset).
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

const MARKER = 'iron-log staging';

const fail = (msg, code = 2) => { console.error(msg); process.exit(code); };

// Neon archives a branch that is older than 14 days and has not been used for a day, and un-archives it on the first connection, which can
// take longer than a normal connect (the docs give no time). So a failed connect is tried again, with a longer wait each time, unless the
// database answered and said no (a wrong login or database name: trying again cannot help). Settings for tests: STAGING_DB_CONNECT_ATTEMPTS
// (default 4, with 30 s to connect each time) and STAGING_DB_CONNECT_PAUSE_MS (default 5000, between tries).
const REFUSED_FOR_GOOD = /^(28|3D|42)/; // invalid login, no such database, a missing role or table: the server answered
// Failures that a waking branch cannot cause: the name does not exist (a typo) or the certificate is wrong. Say so at once.
const NOT_A_WAKING_BRANCH = new Set(['ENOTFOUND', 'ERR_TLS_CERT_ALTNAME_INVALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED']);
async function connect(url) {
  const attempts = Math.max(1, Number(process.env.STAGING_DB_CONNECT_ATTEMPTS) || 4);
  const pause = Number(process.env.STAGING_DB_CONNECT_PAUSE_MS ?? 5000);
  for (let n = 1; ; n++) {
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30_000, statement_timeout: 30_000 });
    try {
      await client.connect();
      return client;
    } catch (e) {
      await client.end().catch(() => {});
      const why = e instanceof Error ? e.message : String(e);
      const code = typeof e === 'object' && e && 'code' in e ? String(e.code) : '';
      if (n >= attempts || REFUSED_FOR_GOOD.test(code) || NOT_A_WAKING_BRANCH.has(code)) fail(`Cannot connect${attempts > 1 ? ` (attempt ${n} of ${attempts})` : ''}: ${why}`);
      console.error(`Could not connect (attempt ${n} of ${attempts}): ${why}. The branch may be waking from Neon's archive; trying again in ${((pause * n) / 1000).toFixed(1)} s.`);
      await new Promise(done => setTimeout(done, pause * n));
    }
  }
}

async function readMark(client) {
  const { rows } = await client.query("select shobj_description(oid, 'pg_database') as mark from pg_database where datname = current_database()");
  return rows[0]?.mark ?? null;
}

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

// The staging login: created on this branch only (a role belongs to one Neon branch, so production never sees it), a member of ironlog_app.
// A reset from production loses it with the rest, which is why `clear` makes it.
async function applyAppRole(client) {
  await client.query(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${APP_ROLE}') then create role ${APP_ROLE} login; end if; end $$`);
  await client.query(`grant ironlog_app to ${APP_ROLE}`);
  const password = process.env.STAGING_APP_PASSWORD;
  if (password) {
    const { rows } = await client.query(`select format('alter role ${APP_ROLE} login password %L', $1::text) as q`, [password]);
    await client.query(rows[0].q);
  }
}

async function check(client) {
  const mark = await readMark(client);
  if (mark === MARKER) { console.log('This database is marked as staging.'); return 0; }
  console.error('This database is not marked as staging. Run: node scripts/staging-db.mjs clear --host <host> --apply');
  return 1;
}

// Neon's pooled address is the same compute as the direct one with "-pooler" in the first label.
const sameHost = h => h.replace(/-pooler(?=\.)/, '');

// Production's owner URL, from the same two places scripts/prod-db.sh reads; null when neither is there.
function productionUrl() {
  if (process.env.PROD_DATABASE_URL) return process.env.PROD_DATABASE_URL;
  if (!existsSync('.env')) return null;
  const line = readFileSync('.env', 'utf8').split('\n').find(l => l.startsWith('DATABASE_URL_UNPOOLED='));
  return line ? line.slice(line.indexOf('=') + 1).replace(/^["']|["']$/g, '') : null;
}

// Run before any connection is made, so a refused URL is never even contacted.
function guardClear(url, host) {
  const actual = new URL(url).hostname;
  if (actual !== host) fail(`--host ${host} does not match the host in STAGING_DATABASE_URL (${actual}). Nothing was changed.`);
  // The typed host only catches a typo; this is what stops the production URL being used here, which would sign everyone out and mark
  // production as staging.
  const prod = productionUrl();
  if (!prod) fail('Cannot tell which database is production: set PROD_DATABASE_URL (or DATABASE_URL_UNPOOLED in .env) so this can refuse it. Nothing was changed.');
  if (sameHost(new URL(prod).hostname) === sameHost(actual)) fail(`${actual} is production's database. Nothing was changed.`);
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
    await applyAppRole(client);
    await client.query("do $$ begin execute format('comment on database %I is %L', current_database(), 'iron-log staging'); end $$");
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => {});
    fail(`Nothing was changed: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log('Cleared, and the database is marked as staging.');
  return 0;
}

const [, , cmd, ...args] = process.argv;
const url = process.env.STAGING_DATABASE_URL;
if (!url) fail('No STAGING_DATABASE_URL: set it to the owner URL of the staging branch.');
if (cmd !== 'check' && cmd !== 'clear') fail('Usage: staging-db.mjs check | clear --host <host> [--apply]');
const hostIndex = args.indexOf('--host');
const host = hostIndex >= 0 ? args[hostIndex + 1] : undefined;
if (cmd === 'clear' && !host) fail('clear needs --host <the host in STAGING_DATABASE_URL>.');
if (cmd === 'clear') guardClear(url, host);
const client = await connect(url);
let code = 2;
try {
  code = cmd === 'check' ? await check(client) : await clear(client, url, args.includes('--apply'));
} finally {
  await client.end().catch(() => {});
}
process.exit(code);
