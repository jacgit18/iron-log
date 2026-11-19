#!/usr/bin/env node
// Runs any owner command against one environment's owner database, with the URL read from Secret Manager in this process and never shown.
//
//   npm run db:sm -- <qa|staging|production> --host <host> -- <command...>
//   npm run db:sm -- staging --host <host> -- npm run catalog:nutrition -- --load=<file>          (a dry run; add --apply to write)
//
// The secret is iron-log-qa-owner-database-url, iron-log-staging-owner-database-url or iron-log-prod-owner-url. The URL is checked (a database URL, not on this
// machine, the host you typed, not production's host for qa and staging and only production's for production, the database's mark, no -pooler for production),
// then the command runs with DATABASE_URL set in ITS environment only (every other database variable is removed from it). Only the environment and the host are
// printed, on stderr. Exit status: the command's own; 64 when this wrapper refused or failed before running it (nothing ran). Needs `gcloud auth login` as a person who may read the secret. Pure parts and their tests: scripts/lib/db-sm.mjs, scripts/dbSm.test.ts.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { connect, connectHost, notLocalProblem, productionUrl, readMark, sameServer } from './lib/db-script.mjs';
import { PROJECT, secret } from './lib/gcloud-secret.mjs';
import { ENVS, REFUSED, check, childEnv, parseArgs, redact } from './lib/db-sm.mjs';

export async function markOf(url, env) {
  const client = await connect(url, ENVS[env].prefix);
  try { return await readMark(client); } finally { await client.end(); }
}

/** The whole command; returns the exit status. Everything that reaches outside is injectable. A message shown or thrown is redacted against the URL. */
export async function main(argv, { read = secret, deps = { host: connectHost, notLocal: notLocalProblem, prodUrl: productionUrl, same: sameServer, mark: markOf }, spawn = spawnSync, log = m => console.error(m), base = process.env } = {}) {
  let url = '';
  try {
    const args = parseArgs(argv);
    url = read(ENVS[args.env].secret);
    const { host, warnings } = await check({ ...args, url }, deps);
    for (const w of warnings) log(`Warning: ${w}`);
    log(`db:sm ${args.env} on ${host} (secret ${ENVS[args.env].secret}, project ${PROJECT}): running ${args.command[0]} with DATABASE_URL set for it only.`);
    const run = spawn(args.command[0], args.command.slice(1), { stdio: 'inherit', env: childEnv(url, base) });
    if (run.error) throw new Error(`Could not start ${args.command[0]} (${run.error.code ?? 'error'}).`);
    return run.status ?? 1;
  } catch (e) {
    log(redact(e instanceof Error ? e.message : String(e), url));
    return REFUSED;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exit(await main(process.argv.slice(2)));
