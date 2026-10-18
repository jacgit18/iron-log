// Decides which jobs of .github/workflows/test.yml a pull request needs, from the files it changes against its base branch.
// Outside a pull request (push to main, manual run) every job runs: that is the full gate the deploy waits for.
// A file this script does not recognise runs every job, so a new kind of file never skips a check by accident.
// Usage: node scripts/ci-changes.mjs                 reads GITHUB_EVENT_NAME and GITHUB_BASE_REF, writes name=true|false to $GITHUB_OUTPUT
//        node scripts/ci-changes.mjs --files=a,b     pretend only those files changed (prints the result, for trying a change)
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const JOBS = ['unit', 'e2e', 'e2e_sync', 'database', 'backup', 'docker'];
const args = process.argv.slice(2);
const given = args.find(a => a.startsWith('--files='));

const dep = /^(package(-lock)?\.json|tsconfig.*\.json|\.oxlintrc.*|vite\.config\.js)$/;
const docs = f => /\.md$/.test(f) || f.startsWith('docs/') || f === 'LICENSE' || (f.startsWith('.github/') && !f.startsWith('.github/workflows/test.yml'));
// Each job, and the files that make it worth running. A dependency or tsconfig change counts for all of them.
const needs = {
  e2e: f => dep.test(f) || /^(src|public|e2e|e2e-accounts)\//.test(f) || /^(index\.html|playwright(\.accounts)?\.config\.js)$/.test(f),
  e2e_sync: f => dep.test(f) || /^(src\/sync|src\/store|server|e2e-sync|db)\//.test(f) || /^(playwright\.sync\.config\.js|scripts\/e2e-sync\.mjs)$/.test(f),
  database: f => dep.test(f) || /^(db|server\/db)\//.test(f) || /^(docker-compose\.yml|scripts\/check-migrations\.mjs)$/.test(f),
  backup: f => dep.test(f) || /^(backup|db)\//.test(f) || /^scripts\/(restore-check\.sh|backup-cloud-run\.sh)$/.test(f),
  docker: f => dep.test(f) || /^(src|server|public|backup)\//.test(f) || /^(Dockerfile|\.dockerignore|index\.html|scripts\/build-server\.mjs)$/.test(f),
};
// Helper scripts, tools and spikes are linted and type-checked by the unit job and need nothing heavier (unless listed above).
const light = f => /^(scripts|tools|spike)\//.test(f);

const all = Object.fromEntries(JOBS.map(j => [j, true]));
const result = Object.fromEntries(JOBS.map(j => [j, false]));

const pr = !given && process.env.GITHUB_EVENT_NAME === 'pull_request';
if (!given && !pr) {
  Object.assign(result, all);
} else {
  const files = given
    ? given.slice(8).split(',')
    : execFileSync('git', ['diff', '--name-only', `origin/${process.env.GITHUB_BASE_REF}...HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const f of files) {
    if (docs(f)) continue;
    const jobs = Object.keys(needs).filter(j => needs[j](f));
    if (jobs.length) jobs.forEach(j => { result[j] = true; });
    else if (!light(f) && !/^(src|server|e2e|e2e-accounts|e2e-sync|db|backup|public)\//.test(f)) Object.assign(result, all);
    result.unit = true;
  }
}

for (const j of JOBS) console.log(`${j.padEnd(9)} ${result[j]}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, JOBS.map(j => `${j}=${result[j]}\n`).join(''));
