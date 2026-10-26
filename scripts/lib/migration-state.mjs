// Which migrations a database has applied (dbmate's schema_migrations table) and how that compares with the migration files, shared by
// scripts/db-pending.mjs (the deploy's check) and scripts/env-parity.mjs (the parity report). Read-only: one select, short timeouts.
import pg from 'pg';
import { pinSslMode } from './ssl-mode.mjs';

/** Exit codes of the parity report. UNKNOWN is 2 (as in db-pending.mjs), never confused with OK. */
export const EXIT = { OK: 0, UNKNOWN: 2, BEHIND: 3, AHEAD: 4 };

/** dbmate's version is the file name up to the first underscore (20261014000001_grocery.sql -> 20261014000001). */
export const versionOf = file => file.slice(0, file.indexOf('_'));

/** The migration files in a folder listing, sorted; anything not named <digits>_<name>.sql is ignored. */
export const migrationFiles = names => names.filter(f => /^\d+_.*\.sql$/.test(f)).sort();

/** The versions a database has applied. Throws with pg's message (it names the host or role at most, never the password). */
export async function appliedVersions(url, { tries = 1, delayMs = 5_000 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise(r => setTimeout(r, delayMs)); // a Neon branch that has scaled to zero needs a moment to wake
    const client = new pg.Client({ connectionString: pinSslMode(url), connectionTimeoutMillis: 15_000, statement_timeout: 15_000 });
    try {
      await client.connect();
      return new Set((await client.query('select version from schema_migrations')).rows.map(r => String(r.version)));
    } catch (e) {
      last = e;
    } finally {
      await client.end().catch(() => {});
    }
  }
  throw last;
}

/** Compare the versions main has (`expected`) with what a database has applied. AHEAD wins over BEHIND: a version main lacks is the louder problem. */
export function classify(expected, applied) {
  const have = new Set([...applied].map(String));
  const want = new Set(expected.map(String));
  const behind = [...want].filter(v => !have.has(v)).sort();
  const ahead = [...have].filter(v => !want.has(v)).sort();
  if (ahead.length) return { status: 'AHEAD', code: EXIT.AHEAD, behind, ahead };
  if (behind.length) return { status: 'BEHIND', code: EXIT.BEHIND, behind, ahead };
  return { status: 'OK', code: EXIT.OK, behind, ahead };
}
