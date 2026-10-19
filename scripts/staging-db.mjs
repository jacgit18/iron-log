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
//                               subscriptions, blanks the stored Google tokens (the account rows stay), and sets the staging mark.
//                               --host must be the host in the URL (typed on purpose, to catch a mistyped one). It also refuses when that host is
//                               production's: PROD_DATABASE_URL, or else DATABASE_URL_UNPOOLED from .env, as scripts/prod-db.sh reads it. With
//                               neither set it refuses too, because it could not tell. `check` needs neither.
//
// The URL is never printed. Run `clear` by hand each time staging is made or reset from production (the mark is lost on a reset).
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

const MARKER = 'iron-log staging';

const fail = (msg, code = 2) => { console.error(msg); process.exit(code); };

async function connect(url) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000, statement_timeout: 30_000 });
  try { await client.connect(); } catch (e) { fail(`Cannot connect: ${e instanceof Error ? e.message : String(e)}`); }
  return client;
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
  if (!apply) { console.log('Dry run. Add --apply to clear these and mark the database as staging.'); return 0; }
  try {
    await client.query('begin');
    for (const step of STEPS) await client.query(step.change);
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
