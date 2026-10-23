#!/usr/bin/env node
// Which migration files the database has not applied yet, asked of the database itself (dbmate's schema_migrations table), not worked
// out from commits. The CI deploy runs it with a read-only login (MIGRATIONS_CHECK_URL, made by `scripts/prod-db.sh reader --apply`)
// that can read schema_migrations and nothing else.
//
//   MIGRATIONS_CHECK_URL=... node scripts/db-pending.mjs
//
// Prints the waiting files (db/migrations/...), one per line. Exit 0 when none wait, 3 when some do, 2 when it cannot tell (no URL, no
// connection, no schema_migrations table). The URL is never printed. MIGRATIONS_DIR overrides the folder (tests).
import { readdirSync } from 'node:fs';
import { appliedVersions, migrationFiles, versionOf } from './lib/migration-state.mjs';

const url = process.env.MIGRATIONS_CHECK_URL;
const dir = process.env.MIGRATIONS_DIR || 'db/migrations';
const fail = msg => { console.error(msg); process.exit(2); };
if (!url) fail('No MIGRATIONS_CHECK_URL: cannot ask the database which migrations it has.');

const files = migrationFiles(readdirSync(dir));

let applied;
try {
  applied = await appliedVersions(url);
} catch (e) {
  // pg's messages name the host or role at most, never the password; the URL itself is not echoed.
  fail(`Cannot read the database's applied migrations: ${e instanceof Error ? e.message : String(e)}`);
}

const waiting = files.filter(f => !applied.has(versionOf(f)));
if (waiting.length) { console.log(waiting.map(f => `${dir}/${f}`).join('\n')); process.exit(3); }
