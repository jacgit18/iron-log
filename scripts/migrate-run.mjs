#!/usr/bin/env node
// The production migrate job (brief production-migrate-job, option B of ADR 068): a Cloud Run job that applies the commit's pending migrations to
// production with the OWNER login, which lives only in Secret Manager. The CI deployer can start the job (run only, no overrides) and write the
// migration files to a private bucket; it can never read the owner URL. Everything that protects production is decided in here, not on the runner:
//
//   1. read the migration files and the COMMIT marker from gs://<MIGRATIONS_BUCKET>/current/ (the deploy syncs them there);
//   2. refuse unless the owner URL (OWNER_DATABASE_URL) and the read-only production URL (READER_DATABASE_URL) name the same server, and the
//      owner URL is the direct (unpooled) one;
//   3. ask production which migrations it has (the read-only login), and work out the pending ones;
//   4. refuse any pending migration that is destructive (scripts/migration-guard.mjs: apply those by hand, runbook section 8);
//   5. `dbmate up` on a private copy of the files, then check with the read-only login that none is left.
//
// Exit 0 when the migrations were applied or none was pending, 1 when a destructive one was refused, 2 for anything else. URLs and file contents
// are never printed. Image: migrate/Dockerfile. Set up and run by hand: scripts/migrate-job.sh.
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { destructiveReasons } from './migration-guard.mjs';
import { appliedVersions, migrationFiles, versionOf } from './lib/migration-state.mjs';

export const EXIT = { OK: 0, DESTRUCTIVE: 1, ERROR: 2 };

/** A file name the job will write to disk: <digits>_<name>.sql and nothing else, so a name from the bucket cannot leave the folder. */
export const safeName = name => /^\d{8,}_[A-Za-z0-9_.-]*\.sql$/.test(name) && !name.includes('..');

/** The commit marker, or '' when it is not a plain commit id. */
export const commitOf = text => (/^[0-9a-f]{7,40}$/.test((text ?? '').trim()) ? text.trim() : '');

/**
 * What to do with the files in the bucket and the versions production has: the pending files (sorted) and the ones among them that are
 * destructive. `files` maps a file name to its text. Pure, so the decision is tested without a database.
 */
export function decide(files, applied) {
  const names = migrationFiles(Object.keys(files));
  const pending = names.filter(n => !applied.has(versionOf(n)));
  const destructive = pending.flatMap(n => { const why = destructiveReasons(files[n]); return why.length ? [{ file: n, why }] : []; });
  return { pending, destructive };
}

/** Why the owner URL cannot be used for a migration, or '' when it can. */
export const ownerProblem = url => (!url ? 'OWNER_DATABASE_URL is not set' : /-pooler(?=\.)/.test(url) ? 'OWNER_DATABASE_URL is the pooled address; migrations need the direct (unpooled) one' : '');

// --- Cloud Storage over the JSON API (no client library: the job's own account token comes from the metadata server) ---
const METADATA = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const token = async () => (await (await fetch(METADATA, { headers: { 'Metadata-Flavor': 'Google' } })).json()).access_token;
const api = async (path, auth) => {
  const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${path}`, { headers: { Authorization: `Bearer ${auth}` } });
  if (!res.ok) throw new Error(`Cloud Storage answered ${res.status} for ${path.split('?')[0]}`);
  return res;
};

/** Every object under gs://<bucket>/<prefix>, as { name: text }, keyed by the file name without the prefix. */
export async function readBucket(bucket, prefix) {
  const auth = await token();
  const list = await (await api(`${encodeURIComponent(bucket)}/o?prefix=${encodeURIComponent(prefix)}`, auth)).json();
  const out = {};
  for (const item of list.items ?? []) {
    const name = item.name.slice(prefix.length);
    if (!name || name.includes('/')) continue; // folders and anything nested are not migrations
    out[name] = await (await api(`${encodeURIComponent(bucket)}/o/${encodeURIComponent(item.name)}?alt=media`, auth)).text();
  }
  return out;
}

const say = msg => console.log(msg);
const stop = (msg, code = EXIT.ERROR) => { console.error(msg); process.exit(code); };

async function main() {
  const owner = process.env.OWNER_DATABASE_URL;
  const reader = process.env.READER_DATABASE_URL;
  const bucket = process.env.MIGRATIONS_BUCKET;
  if (!bucket) stop('MIGRATIONS_BUCKET is not set: nothing was migrated.');
  if (!reader) stop('READER_DATABASE_URL is not set (the read-only production login): nothing was migrated.');
  const bad = ownerProblem(owner);
  if (bad) stop(`${bad}: nothing was migrated.`);

  // The owner login must be production's database. Reuses the runner-era check, now inside the job.
  try {
    execFileSync('node', ['scripts/same-database.mjs'], { env: { PATH: process.env.PATH, OWNER_URL: owner, READER_URL: reader }, stdio: ['ignore', 'inherit', 'inherit'] });
  } catch { stop('The owner login is not production\'s database: nothing was migrated.'); }

  let files;
  try { files = await readBucket(bucket, 'current/'); } catch (e) { stop(`Could not read the migrations from the bucket: ${e instanceof Error ? e.message : String(e)}`); }
  const commit = commitOf(files.COMMIT);
  delete files.COMMIT;
  const names = migrationFiles(Object.keys(files));
  const unsafe = names.filter(n => !safeName(n));
  if (unsafe.length) stop(`Refusing file names that are not <version>_<name>.sql: ${unsafe.join(', ')}`);
  if (!names.length) stop('The bucket holds no migration files: nothing was migrated.');
  say(`Migrations for commit ${commit || 'unknown'}: ${names.length} files.`);

  let applied;
  try { applied = await appliedVersions(reader, { tries: 3 }); } catch (e) { stop(`Cannot read the applied migrations: ${e instanceof Error ? e.message : String(e)}`); }
  const { pending, destructive } = decide(files, applied);
  if (!pending.length) { say('Production has every migration. Nothing to apply.'); return; }
  say(`Pending: ${pending.join(', ')}`);
  if (destructive.length) {
    for (const d of destructive) console.error(`${d.file}: ${d.why.join(', ')}`);
    stop('A pending migration is destructive. It is not applied automatically: check the live app no longer uses what it removes, apply it by hand (scripts/prod-db.sh migrate --apply, runbook section 8), then run the deploy again.', EXIT.DESTRUCTIVE);
  }

  // dbmate reads a folder, so the files go to a private temp folder (names already checked above).
  const dir = mkdtempSync(join(tmpdir(), 'migrations-'));
  for (const n of names) writeFileSync(join(dir, n), files[n], { mode: 0o600 });
  try {
    await promisify(execFile)('node_modules/.bin/dbmate', ['--no-dump-schema', '--wait', '--wait-timeout', '60s', '--migrations-dir', dir, 'up'], { env: { PATH: process.env.PATH, DATABASE_URL: owner } }).then(r => say(r.stdout.trim()));
  } catch (e) {
    // dbmate's output can name the failing file and the SQL error; it does not print the URL.
    console.error(String((e && typeof e === 'object' && 'stderr' in e ? e.stderr : '') || (e instanceof Error ? e.message : e)).trim());
    stop('dbmate failed. Each migration runs in its own transaction, so the one that failed changed nothing; earlier ones in this run stay applied. Restore from the backup taken before this run only if needed.');
  }

  let after;
  try { after = await appliedVersions(reader, { tries: 3 }); } catch (e) { stop(`Applied, but cannot confirm: ${e instanceof Error ? e.message : String(e)}`); }
  const left = decide(files, after).pending;
  if (left.length) stop(`Applied, but production still reports ${left.join(', ')} as pending.`);
  say(`Applied ${pending.length} migration${pending.length === 1 ? '' : 's'}; production has every migration.`);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch(e => stop(`Unexpected error: ${e instanceof Error ? e.message : String(e)}`));
}