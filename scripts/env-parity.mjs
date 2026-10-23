#!/usr/bin/env node
// Environment parity, one environment at a time (plan: env-parity-report-plan). Asks one database which migrations it has applied and
// compares that with the versions main has. It runs as the Cloud Run job `iron-log-parity` (scripts/parity-job.sh), started once per
// environment by .github/workflows/env-parity.yml, but it runs anywhere:
//
//   PARITY_PRODUCTION_URL=<read-only URL> node scripts/env-parity.mjs production 20261007000001,20261007000002,...
//
// The first argument names the environment and picks the URL (PARITY_<NAME>_URL); the second is main's migration versions, comma
// separated, or one argument each (the workflow lists db/migrations and passes them, so the job image never changes with a commit). The URL is a
// `migrations_reader` login (scripts/db-reader.mjs): it reads schema_migrations and nothing else. The URL is never printed.
//
// Exit 0 OK; 3 BEHIND (main has migrations the database lacks); 4 AHEAD OF MAIN (the database has a version main lacks; wins over
// BEHIND); 2 UNKNOWN (no URL, no list, no connection, no schema_migrations table). UNKNOWN is never reported as OK.
import { EXIT, appliedVersions, classify } from './lib/migration-state.mjs';

// gcloud splits `--args` on commas, so the list can arrive as one argument or as many: take every argument after the name.
const [name = '', ...rest] = process.argv.slice(2);
const list = rest.join(',');
const label = name.toLowerCase();
const unknown = why => { console.log(`${label || '?'}: UNKNOWN (${why})`); process.exit(EXIT.UNKNOWN); };

if (!/^[a-z][a-z0-9-]*$/.test(label)) unknown('no environment name given');
const url = process.env[`PARITY_${label.toUpperCase().replace(/-/g, '_')}_URL`];
if (!url) unknown(`no PARITY_${label.toUpperCase().replace(/-/g, '_')}_URL`);
const expected = list.split(',').map(v => v.trim()).filter(v => /^\d+$/.test(v));
if (!expected.length) unknown('main\'s migration list is empty');

let applied;
try {
  applied = await appliedVersions(url, { tries: 3, delayMs: Number(process.env.PARITY_RETRY_DELAY_MS ?? 5_000) });
} catch (e) {
  // pg's message names the host or role at most, never the password.
  unknown(`cannot read the database: ${e instanceof Error ? e.message : String(e)}`);
}

const r = classify(expected, applied);
const show = vs => vs.join(', ');
if (r.status === 'OK') console.log(`${label}: OK (${applied.size} applied, 0 behind)`);
else if (r.status === 'BEHIND') console.log(`${label}: BEHIND ${r.behind.length} (not applied: ${show(r.behind)})`);
else console.log(`${label}: AHEAD OF MAIN ${r.ahead.length} (applied but not in main: ${show(r.ahead)}${r.behind.length ? `; also not applied: ${show(r.behind)}` : ''})`);
process.exit(r.code);
