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
// The import runs the code of the checkout this is run from. Needs `gcloud auth login` as a person who may read the secret. Before anything runs, the database must
// carry the QA mark (scripts/qa-db.mjs reset sets it) and must not be production's host, so a wrong secret cannot load another environment.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connect, connectHost, guardHost, readMark } from './lib/db-script.mjs';

const PROJECT = process.env.GCP_PROJECT_ID || 'iron-log-jacgit18';
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

// The value of a secret, never printed: only its name appears in a message.
function secret(name) {
  const r = spawnSync('gcloud', ['secrets', 'versions', 'access', 'latest', `--secret=${name}`, `--project=${PROJECT}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error) die(`Could not run gcloud (${r.error.code ?? r.error.message}). Install it and run: gcloud auth login`);
  const value = (r.stdout ?? '').trim();
  if (r.status !== 0 || !value) {
    const said = r.status !== 0 ? (r.stderr ?? '').split('\n').find(l => l.trim()) : '';
    die(`Could not read the secret ${name} in project ${PROJECT}.${said ? ` gcloud said: ${said.trim().slice(0, 200)}` : ''} Run: gcloud auth login (as someone who can read it).`);
  }
  return value;
}

// The main checkout's .cache (the UPC cache and hits file live there), found from git's shared directory; undefined when it has none.
function mainCacheDir() {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const dir = r.status === 0 ? join(dirname(r.stdout.trim()), '.cache') : '';
  return dir && existsSync(join(dir, 'dsld-upcs.tsv')) ? dir : undefined;
}

async function main() {
  const [sub, ...extra] = process.argv.slice(2);
  if (!['catalog', 'upcs'].includes(sub)) die(USAGE);
  let command;
  try { command = plan(sub, extra, { cacheDir: sub === 'upcs' ? mainCacheDir() : undefined }); } catch (e) { die(e.message); }
  const url = secret(URL_SECRET);
  let host;
  try { host = await checkTarget(url); } catch (e) { die(e.message); }
  const apply = extra.includes('--apply');
  console.error(`QA ${sub} on ${host} (secret from project ${PROJECT}), marked as QA: ${apply ? 'writing (--apply)' : 'dry run, nothing changes (add --apply to write)'}.`);
  const run = spawnSync('npx', ['tsx', command.file, ...command.args], { stdio: 'inherit', cwd: REPO, env: { ...process.env, DATABASE_URL: url } });
  if (run.error) die(`Could not start the import script (${run.error.code ?? run.error.message}).`);
  process.exit(run.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
