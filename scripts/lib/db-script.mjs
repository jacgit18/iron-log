// What the environment database scripts (scripts/staging-db.mjs, scripts/qa-db.mjs) share: a connect that waits for a Neon branch to wake,
// the mark an environment's database carries, the login the app uses, and the check that refuses production's address.
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

export const fail = (msg, code = 2) => { console.error(msg); process.exit(code); };

// Neon archives a branch that is older than 14 days and has not been used for a day, and un-archives it on the first connection, which can
// take longer than a normal connect (the docs give no time). So a failed connect is tried again, with a longer wait each time, unless the
// database answered and said no (a wrong login or database name: trying again cannot help). Settings for tests, with the environment's
// prefix (STAGING or QA): <PREFIX>_DB_CONNECT_ATTEMPTS (default 4, with 30 s to connect each time) and <PREFIX>_DB_CONNECT_PAUSE_MS
// (default 5000, between tries).
const REFUSED_FOR_GOOD = /^(28|3D|42)/; // invalid login, no such database, a missing role or table: the server answered
// Failures that a waking branch cannot cause: the name does not exist (a typo) or the certificate is wrong. Say so at once.
const NOT_A_WAKING_BRANCH = new Set(['ENOTFOUND', 'ERR_TLS_CERT_ALTNAME_INVALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED']);

export async function connect(url, prefix) {
  const attempts = Math.max(1, Number(process.env[`${prefix}_DB_CONNECT_ATTEMPTS`]) || 4);
  const pause = Number(process.env[`${prefix}_DB_CONNECT_PAUSE_MS`] ?? 5000);
  for (let n = 1; ; n++) {
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30_000, statement_timeout: 30_000 });
    try {
      await client.connect();
      // If the connection is cut later, pg also emits 'error' on the client; with no listener Node dies with exit 1 (which `check` documents as
      // "not marked"). The query that is running rejects with the same error, and the catch at the bottom of the script reports it.
      client.on('error', () => {});
      return client;
    } catch (e) {
      await client.end().catch(() => {});
      const why = e instanceof Error ? e.message : String(e);
      const code = typeof e === 'object' && e && 'code' in e ? String(e.code) : '';
      if (n >= attempts || REFUSED_FOR_GOOD.test(code) || NOT_A_WAKING_BRANCH.has(code)) fail(`Cannot connect${attempts > 1 ? ` (attempt ${n} of ${attempts})` : ''}: ${why}`);
      // A refused or unreachable address is the URL or the network, not a branch waking up, so the archive hint is left off.
      const hint = ['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code) ? '' : " The branch may be waking from Neon's archive;";
      console.error(`Could not connect (attempt ${n} of ${attempts}): ${why}.${hint} Trying again in ${((pause * n) / 1000).toFixed(1)} s.`);
      await new Promise(done => setTimeout(done, pause * n));
    }
  }
}

/** The mark on the database (a comment on it), or null. */
export async function readMark(client) {
  const { rows } = await client.query("select shobj_description(oid, 'pg_database') as mark from pg_database where datname = current_database()");
  return rows[0]?.mark ?? null;
}

/** Marks the database. Inside the caller's transaction. */
export const setMark = (client, mark) => client.query("do $$ begin execute format('comment on database %I is %L', current_database(), $m$" + mark + "$m$); end $$");

// The environment's login: created on this branch only (a role belongs to one Neon branch, so production never sees it), a member of
// ironlog_app, whose grants and row-level-security policies it inherits. A reset from production loses it, so the scripts make it.
// `role` is a fixed name from the calling script; the password, if given in the environment variable `passwordEnv`, is never printed.
export async function applyAppRole(client, role, passwordEnv) {
  await client.query(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${role}') then create role ${role} login; end if; end $$`);
  await client.query(`grant ironlog_app to ${role}`);
  const password = process.env[passwordEnv];
  if (password) {
    const { rows } = await client.query(`select format('alter role ${role} login password %L', $1::text) as q`, [password]);
    await client.query(rows[0].q);
  }
}

/** The host the pg driver will connect to for this URL, in one spelling (lower case, no trailing dot). It is not `new URL(url).hostname`: for a postgres: URL that
 *  keeps the case and any percent-escapes, and ignores a `?host=` parameter, which pg lets replace the host before the @, so such a URL could name one machine to
 *  the guard and connect to another (code review R-01). Asking the driver itself cannot disagree with what it then does. */
export function connectHost(url) {
  const host = new pg.Client({ connectionString: url }).host;
  return typeof host === 'string' ? host.toLowerCase().replace(/\.+$/, '') : '';
}

// Neon's pooled address is the same compute as the direct one with "-pooler" in the first label.
export const sameHost = h => h.replace(/-pooler(?=\.)/, '');

// Production's owner URL, from the same two places scripts/prod-db.sh reads; null when neither is there.
export function productionUrl() {
  if (process.env.PROD_DATABASE_URL) return process.env.PROD_DATABASE_URL;
  if (!existsSync('.env')) return null;
  const line = readFileSync('.env', 'utf8').split('\n').find(l => l.startsWith('DATABASE_URL_UNPOOLED='));
  return line ? line.slice(line.indexOf('=') + 1).replace(/^["']|["']$/g, '') : null;
}

/** Run before any connection is made, so a refused URL is never even contacted. `urlName` is the environment variable the URL came from. */
export function guardHost(url, host, urlName) {
  const actual = connectHost(url);
  if (!actual) fail(`The host in ${urlName} cannot be read. Nothing was changed.`);
  if (actual !== host.toLowerCase().replace(/\.+$/, '')) fail(`--host ${host} does not match the host in ${urlName} (${actual}). Nothing was changed.`);
  // The typed host only catches a typo; this is what stops the production URL being used here, which would sign everyone out and mark
  // production as another environment.
  const prod = productionUrl();
  if (!prod) fail('Cannot tell which database is production: set PROD_DATABASE_URL (or DATABASE_URL_UNPOOLED in .env) so this can refuse it. Nothing was changed.');
  if (sameHost(connectHost(prod)) === sameHost(actual)) fail(`${actual} is production's database. Nothing was changed.`);
}
