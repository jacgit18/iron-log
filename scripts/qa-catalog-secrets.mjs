#!/usr/bin/env node
// Loads the supplement catalog and the supplement UPC table into the QA database IN PLACE (QA is not reset from production: that would wipe its seeded
// accounts). Like qa-seed-secrets.mjs, nobody copies a URL: QA's owner database URL is read from Secret Manager here, checked, handed to the import script
// through that process's DATABASE_URL only, and never printed, exported or put on a command line.
//
//   npm run qa:catalog:sm -- catalog [--apply]     1st: scripts/catalog-import.mjs --source dsld (downloads the NIH label database; a few minutes)
//   npm run qa:catalog:sm -- upcs [--apply]        2nd: scripts/supplement-upc-import.mjs, the scope production used: the priority brands only
//
// `catalog` must run before `upcs` (a UPC points at a catalog row). Both are a dry run unless --apply. Extra flags go through to the import script.
// `upcs` reuses .cache/dsld-upcs.tsv and .cache/dsld-upcs.hits.json from the main checkout (the hits file is reused for 7 days), so it makes no NIH label calls.
// It stops before any NIH call when that cache is missing, when the hits file is older than 7 days (add --refresh-hits to download the search list again: hundreds
// of MB, minutes) or when QA's catalog has no live dsld rows yet (run `catalog` first). --cache <file> uses your own cache file instead and skips those two cache checks.
// The import runs the code of the checkout this is run from. Needs `gcloud auth login` as a person who may read the secret. Before anything runs, the database must
// carry the QA mark (scripts/qa-db.mjs reset sets it) and must not be production's host, so a wrong secret cannot load another environment.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connect, connectHost, guardHost, readMark } from './lib/db-script.mjs';
import { PROJECT, secret } from './lib/gcloud-secret.mjs';

export const URL_SECRET = 'iron-log-qa-owner-database-url';
export const QA_MARK = 'iron-log qa';
export const UPC_BRANDS = ['thorne', 'sports research', 'now', 'nature made'];
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const USAGE = `Usage: npm run qa:catalog:sm -- catalog|upcs [--apply] [more flags for the import script]
  catalog   NIH supplement labels into QA's catalog (scripts/catalog-import.mjs --source dsld; downloads, a few minutes). Run this FIRST.
  upcs      the UPC table for the priority brands (scripts/supplement-upc-import.mjs --only-brands, no NIH label calls). Run after catalog.
Both are a dry run unless --apply.`;

/** The import command for a subcommand, as { file, args }. `cacheDir` (the main checkout's .cache, when it exists) feeds the UPC cache and hits file. */
export function plan(sub, extra, { cacheDir } = {}) {
  const apply = extra.includes('--apply');
  const rest = extra.filter(a => a !== '--apply');
  const tail = apply ? ['--apply'] : [];
  if (sub === 'catalog') {
    if (rest.some(a => a === '--source' || a.startsWith('--source='))) throw new Error('Do not pass --source: catalog always loads dsld.');
    return { file: 'scripts/catalog-import.mjs', args: ['--source', 'dsld', ...rest, ...tail] };
  }
  if (sub === 'upcs') {
    const cache = cacheDir && !rest.some(a => a === '--cache' || a.startsWith('--cache=')) ? ['--cache', join(cacheDir, 'dsld-upcs.tsv')] : [];
    const brands = UPC_BRANDS.flatMap(b => ['--brand', b]);
    return { file: 'scripts/supplement-upc-import.mjs', args: ['--only-brands', ...brands, ...cache, ...rest, ...tail] };
  }
  throw new Error(USAGE);
}

/** Refuses (throws a message that names no value) unless the URL is a database URL that is not production's host and whose database carries the QA mark.
 *  The checks are injectable for tests. */
export async function checkTarget(url, { guard = guardHost, open = connect, mark = readMark } = {}) {
  let host;
  try {
    const u = new URL(url);
    if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') throw new Error('not a database URL');
    host = connectHost(url);
  } catch { throw new Error(`The secret ${URL_SECRET} is not a database URL.`); }
  await guard(url, host, URL_SECRET); // refuses production's host (and an alias of it) before any connection is made
  const client = await open(url, 'QA');
  try {
    if ((await mark(client)) !== QA_MARK) throw new Error(`The database at ${host} does not carry the QA mark. Nothing was changed.`);
  } finally { await client.end(); }
  return host;
}

const die = msg => { console.error(msg); process.exit(1); };

const WEEK_MS = 7 * 86_400_000; // how long supplement-upc-import.mjs reuses its saved search results

/** What would make `upcs` read NIH (labels, or the whole search list) instead of reusing the cache; null when it will not. The hits file's age is read from `cacheDir` with `stat` (injectable). */
export function upcsProblem(extra, cacheDir, { stat = statSync, now = Date.now() } = {}) {
  if (extra.some(a => a === '--cache' || a.startsWith('--cache='))) return null; // their own cache file, their own call
  let hitsMtimeMs;
  try { hitsMtimeMs = cacheDir && stat(join(cacheDir, 'dsld-upcs.hits.json')).mtimeMs; } catch { /* missing: reported below */ }
  if (!cacheDir) return 'The UPC cache .cache/dsld-upcs.tsv was not found in the main checkout, so this would read thousands of NIH labels (about 1,000 an hour). Copy it there, or pass --cache <file>. Nothing was changed.';
  if (!extra.includes('--refresh-hits') && (hitsMtimeMs === undefined || now - hitsMtimeMs >= WEEK_MS)) return 'The saved NIH search list (.cache/dsld-upcs.hits.json) is missing or older than 7 days, so this would download it again (hundreds of MB, minutes). Add --refresh-hits to do that. Nothing was changed.';
  return null;
}

/** The import child's environment: QA's URL, and no production URL left over from the guard. */
export const childEnv = (url, base = process.env) => {
  const env = { ...base, DATABASE_URL: url };
  delete env.PROD_DATABASE_URL;
  delete env.DATABASE_URL_UNPOOLED;
  return env;
};

/** True when QA's catalog has live dsld rows (the rows a UPC points at). */
export async function hasCatalog(client) {
  const { rows } = await client.query("select 1 from catalog_items where source = 'dsld' and retired_at is null limit 1");
  return rows.length > 0;
}

// The main checkout's .cache (the UPC cache and hits file live there), found from git's shared directory; undefined when it has none.
function mainCacheDir() {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const dir = r.status === 0 ? join(dirname(r.stdout.trim()), '.cache') : '';
  return dir && existsSync(join(dir, 'dsld-upcs.tsv')) ? dir : undefined;
}

/** The whole command. Returns the import's exit status. The parts that reach outside (gcloud, the database, the main checkout's cache, the import process, exit) are
 *  injectable, so a test can run every line of it, including the `upcs` preflight, without a real secret or database. */
export async function main(argv, { read = secret, check = checkTarget, open = connect, catalogLoaded = hasCatalog, cacheOf = mainCacheDir, spawn = spawnSync, fail = die } = {}) {
  const [sub, ...extra] = argv;
  if (!['catalog', 'upcs'].includes(sub)) fail(USAGE);
  const cacheDir = sub === 'upcs' ? cacheOf() : undefined;
  let command;
  try { command = plan(sub, extra, { cacheDir }); } catch (e) { fail(e.message); }
  const url = read(URL_SECRET);
  let host;
  try { host = await check(url); } catch (e) { fail(e.message); }
  if (sub === 'upcs') {
    const problem = upcsProblem(extra, cacheDir);
    if (problem) fail(problem);
    const client = await open(url, 'QA');
    try { if (!(await catalogLoaded(client))) fail(`QA's catalog at ${host} has no live dsld rows. Run: npm run qa:catalog:sm -- catalog --apply (first). Nothing was changed.`); } finally { await client.end(); }
  }
  const apply = extra.includes('--apply');
  console.error(`QA ${sub} on ${host} (secret from project ${PROJECT}), marked as QA: ${apply ? 'writing (--apply)' : 'dry run, nothing changes (add --apply to write)'}.`);
  const run = spawn('npx', ['tsx', command.file, ...command.args], { stdio: 'inherit', cwd: REPO, env: childEnv(url) });
  if (run.error) fail(`Could not start the import script (${run.error.code ?? run.error.message}).`);
  return run.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exit(await main(process.argv.slice(2)));
