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

const PROJECT = process.env.GCP_PROJECT_ID || 'iron-log-jacgit18';
export const URL_SECRET = 'iron-log-qa-owner-database-url';
export const KEY_SECRET = 'iron-log-qa-pii-key';

const die = msg => { console.error(msg); process.exit(1); };

// The value of a secret, never printed: only its name appears in a message.
function secret(name) {
  const r = spawnSync('gcloud', ['secrets', 'versions', 'access', 'latest', `--secret=${name}`, `--project=${PROJECT}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error) die(`Could not run gcloud (${r.error.code ?? r.error.message}). Install it and run: gcloud auth login`);
  const value = (r.stdout ?? '').trim();
  if (r.status !== 0 || !value) die(`Could not read the secret ${name} in project ${PROJECT}. Run: gcloud auth login (as someone who can read it).`);
  return value;
}

const args = process.argv.slice(2);
if (args.includes('--host')) die('Do not pass --host: it is taken from the secret.');
const apply = args.includes('--apply');

const url = secret(URL_SECRET);
let host;
try { host = new URL(url).hostname; } catch { die(`The secret ${URL_SECRET} is not a database URL.`); }
const key = apply ? secret(KEY_SECRET) : undefined;

console.error(`QA seed on ${host}: ${apply ? 'writing (--apply)' : 'dry run, nothing changes (add --apply to write)'}.`);
const env = { ...process.env, QA_DATABASE_URL: url };
if (key) env.QA_PII_ENCRYPTION_KEY = key; else delete env.QA_PII_ENCRYPTION_KEY;
const run = spawnSync('npx', ['tsx', 'scripts/qa-seed.mjs', '--host', host, ...args], { stdio: 'inherit', env });
process.exit(run.status ?? 1);
