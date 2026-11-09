#!/usr/bin/env node
// Seeds the QA test accounts without anyone copying a URL or a key: it reads QA's owner database URL and QA's own PII key from Secret Manager,
// hands them to scripts/qa-seed.mjs through that process's environment only, and exits, so neither value is ever typed, exported in your shell,
// put on a command line, printed or left behind.
//
//   npm run qa:seed:sm                                  dry run, every account (changes nothing)
//   npm run qa:seed:sm -- --persona vitamin-tracker     dry run, one account
//   npm run qa:seed:sm -- --persona vitamin-tracker --apply
//
// Needs `gcloud auth login` as a person who may read those two secrets. The project is pinned here (gcloud's own default project can be a
// different one: `iron-log-spike` holds only the sign-in clients). The key is read only with --apply. The host that qa-seed.mjs makes you
// type is taken from the URL here; qa-seed.mjs still refuses a database without the QA mark, so a wrong secret cannot seed anything else.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = process.env.GCP_PROJECT_ID || 'iron-log-jacgit18';
export const URL_SECRET = 'iron-log-qa-owner-database-url';
export const KEY_SECRET = 'iron-log-qa-pii-key';

const die = msg => { console.error(msg); process.exit(1); };

// The value of a secret, never printed: only its name appears in a message.
function secret(name) {
  const r = spawnSync('gcloud', ['secrets', 'versions', 'access', 'latest', `--secret=${name}`, `--project=${PROJECT}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error) die(`Could not run gcloud (${r.error.code ?? r.error.message}). Install it and run: gcloud auth login`);
  const value = (r.stdout ?? '').trim();
  if (r.status !== 0 || !value) {
    const said = r.status !== 0 ? (r.stderr ?? '').split('\n').find(l => l.trim()) : ''; // gcloud's own reason, shown only when it failed (so no value was returned)
    die(`Could not read the secret ${name} in project ${PROJECT}.${said ? ` gcloud said: ${said.trim().slice(0, 200)}` : ''} Run: gcloud auth login (as someone who can read it).`);
  }
  return value;
}

const args = process.argv.slice(2);
if (args.some(a => a === '--host' || a.startsWith('--host='))) die('Do not pass --host: it is taken from the secret.');
const apply = args.includes('--apply');

const url = secret(URL_SECRET);
let host;
try {
  const u = new URL(url);
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') throw new Error('not a database URL');
  host = u.hostname;
} catch { die(`The secret ${URL_SECRET} is not a database URL.`); }
const key = apply ? secret(KEY_SECRET) : undefined;

console.error(`QA seed on ${host} (secrets from project ${PROJECT}): ${apply ? 'writing (--apply)' : 'dry run, nothing changes (add --apply to write)'}.`);
const env = { ...process.env, QA_DATABASE_URL: url };
if (key) env.QA_PII_ENCRYPTION_KEY = key; else delete env.QA_PII_ENCRYPTION_KEY;
// The seed script is found next to this one, so the command works from any folder.
const seed = join(dirname(fileURLToPath(import.meta.url)), 'qa-seed.mjs');
const run = spawnSync('npx', ['tsx', seed, '--host', host, ...args], { stdio: 'inherit', env });
if (run.error) die(`Could not start the seed script (${run.error.code ?? run.error.message}).`);
process.exit(run.status ?? 1);
