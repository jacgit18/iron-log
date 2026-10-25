// Runs the checks that fit what changed, so a docs edit does not wait for Playwright and a sync change does not skip it.
// Usage: npm run check            run the checks for the files changed against origin/main (committed, staged and unstaged)
//        npm run check -- --list  show which checks it would run and why, without running them
//        npm run check -- --files=a,b  pretend only those files changed (with --list, to see what a change would run)
//        npm run check -- --all   run every check that does not need a database (typecheck, test, lint, e2e)
// CI (.github/workflows/test.yml) runs everything on main and the jobs scripts/ci-changes.mjs picks on a pull request; this is the local shortcut. A file it does not recognise runs everything.
// The db:check and e2e:sync steps need the local Postgres: it is started (npm run db:start) and used when DATABASE_URL is not set; if it cannot be reached the step is not run and the script exits 1.
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { STAMP_FILE, makeStamp } from './lib/check-stamp.mjs';
import { is, planChecks } from './lib/check-plan.mjs';
import { userInfo } from 'node:os';

const args = process.argv.slice(2);
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).split('\n').filter(Boolean);

// Against origin/main, not the local main: a local main nobody pulls falls behind, and every file merged since then counts as changed.
// Falls back to main when there is no origin, and to HEAD when there is neither.
const [base, baseRef] = (() => {
  for (const ref of ['origin/main', 'main']) {
    try {
      return [execFileSync('git', ['merge-base', 'HEAD', ref], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), ref];
    } catch { /* try the next */ }
  }
  return ['HEAD', 'HEAD'];
})();
// --files a,b pretends exactly those files changed (to see what a kind of change would run).
const given = args.find(a => a.startsWith('--files='));
const files = given ? given.slice(8).split(',') : [...new Set([...git('diff', '--name-only', base), ...git('ls-files', '--others', '--exclude-standard')])];

let fullTests = args.includes('--all');
let checks = new Map(); // name -> why
if (!args.includes('--all') && !files.length) {
  console.log(`Nothing changed against ${baseRef}: no checks to run.`);
  process.exit(0);
}
({ checks, fullTests } = planChecks(files, args.includes('--all')));

const order = ['typecheck', 'lint', 'workflows', 'test', 'build', 'db:check', 'e2e', 'e2e:sync'];
const plan = order.filter(c => checks.has(c));

if (!plan.length) {
  console.log(`${files.length} changed file(s), none need a check (docs and repo metadata only).`);
  process.exit(0);
}
console.log(`Changed against ${baseRef}: ${files.length} file(s). Checks: ${plan.join(', ')}`);
for (const c of plan) console.log(`  ${c.padEnd(9)} ${checks.get(c)}`);
// Not a check that can fail: CLAUDE.md asks for these on UI work, and a reminder at push time is cheaper than a PR comment.
// Printed again after the checks pass, because e2e output can push it off the screen.
const uiFiles = files.filter(f => !is.docs(f) && !is.unitTest(f) && !is.e2eSpec(f)
  && (is.css(f) || /\.tsx$/.test(f) || f === 'index.html' || f.startsWith('public/') || f === 'src/fonts.ts' || f.startsWith('src/assets/') || f.startsWith('src/components/') || f.startsWith('src/hooks/')));
const reminder = () => {
  if (!uiFiles.length) return;
  console.log(`  Reminder: ${uiFiles.length} UI or style file(s) changed (${uiFiles[0]}${uiFiles.length > 1 ? ', ...' : ''}).`);
  console.log('    Run `node scripts/lighthouse.mjs --check` and put before and after in the PR; update the ux/ docs and feature-map.md.');
};
reminder();
if (args.includes('--list')) process.exit(0);

// One check at a time on this machine. Two sessions pushing at once each start a Postgres container per server test file plus Playwright, and
// the load makes both runs time out (the reason for most "skip the hook" pushes). The second run waits for the first, up to 30 minutes.
// Needs flock (Linux, util-linux); without it the check runs as before. IRON_LOG_CHECK_LOCK overrides the lock file, IRON_LOG_CHECK_LOCKED marks the re-run.
if (!process.env.IRON_LOG_CHECK_LOCKED && !args.includes('--list')) {
  const lock = process.env.IRON_LOG_CHECK_LOCK || `/tmp/iron-log-check-${userInfo().uid}.lock`;
  const hasFlock = spawnSync('flock', ['--version'], { stdio: 'ignore' }).status === 0;
  if (hasFlock) {
    const env = { ...process.env, IRON_LOG_CHECK_LOCKED: '1' };
    const rerun = [process.execPath, ...process.argv.slice(1)];
    if (spawnSync('flock', ['-n', lock, 'true'], { stdio: 'ignore' }).status !== 0) console.log('Another check is running on this machine; waiting for it to finish (up to 30 minutes).');
    // -E 75: flock's own "gave up waiting" code, told apart from the check failing (which exits 1).
    // -o: the child does not inherit the lock descriptor, so a vite server orphaned by a hard kill cannot keep the lock held after flock itself is gone.
    // The lock path is fixed (not os.tmpdir()), so a different TMPDIR in two shells still means one lock.
    const r = spawnSync('flock', ['-o', '-w', '1800', '-E', '75', lock, ...rerun], { stdio: 'inherit', env });
    if (r.status === 75) { console.error('Gave up: another check on this machine held the lock for 30 minutes. This check did not run. Retry when it finishes, or skip once with SKIP_CHECK=1 git push.'); process.exit(75); }
    process.exit(r.status ?? 1);
  }
}

const needsDb = new Set(['db:check', 'e2e:sync']);
// The sync and migration checks need the local Postgres. Rather than skip them (CI runs them, so a skip is how a sync bug reached a PR),
// start it with `npm run db:start` and use its default address, unless DATABASE_URL is already set.
const LOCAL_DB = 'postgres://ironlog:ironlog@127.0.0.1:5433/ironlog';
const reachable = () => new Promise(resolve => {
  const c = createConnection({ host: '127.0.0.1', port: 5433 }, () => { c.destroy(); resolve(true); });
  c.on('error', () => resolve(false));
  c.setTimeout(1500, () => { c.destroy(); resolve(false); });
});
if (plan.some(c => needsDb.has(c)) && !process.env.DATABASE_URL) {
  if (!(await reachable())) spawnSync('npm', ['run', 'db:start'], { stdio: 'inherit' });
  if (await reachable()) {
    process.env.DATABASE_URL = LOCAL_DB;
    console.log(`Using the local database (${LOCAL_DB.replace(/\/\/.*@/, '//…@')}).`);
  } else {
    console.warn('The local database is not reachable on port 5433. If the container exists without the port, run: docker compose up -d --force-recreate --wait db');
  }
}
const skipped = [];
for (const c of plan) {
  if (needsDb.has(c) && !process.env.DATABASE_URL) {
    skipped.push(c);
    continue;
  }
  const related = c === 'test' && !fullTests;
  // The unit step always goes through scripts/unit-tests.mjs, so the worker cap (UNIT_WORKERS) also applies to a full run.
  const viaScript = c === 'test';
  if (c === 'workflows') {
    console.log('\n> node scripts/check-workflows.mjs');
    const w = spawnSync('node', ['scripts/check-workflows.mjs'], { stdio: 'inherit' });
    if (w.status !== 0) { console.error('\nFailed: workflows'); process.exit(w.status ?? 1); }
    continue;
  }
  console.log(viaScript ? `\n> node scripts/unit-tests.mjs ${related ? '(the tests related to what changed)' : '--full (every unit test)'}` : `\n> npm run ${c}`);
  const r = spawnSync(...(viaScript ? ['node', ['scripts/unit-tests.mjs', related ? `--base=${baseRef}` : '--full']] : ['npm', ['run', c]]), { stdio: 'inherit', env: { ...process.env, FRESH_SERVER: '1' } });
  if (r.status !== 0) {
    console.error(`\nFailed: ${c}`);
    process.exit(r.status ?? 1);
  }
}
if (skipped.length) {
  console.warn(`\nNot run, and CI will run them (set DATABASE_URL, or fix the local database with npm run db:start): ${skipped.join(', ')}`);
  process.exit(1);
}
console.log('\nAll chosen checks passed. CI still runs everything.');
// The stamp scripts/pr-body.mjs reads to tick the PR's Checks boxes. Not written for a pretend file list. It records the commit and whether the tree was clean.
if (!given) {
  try {
    const stampPath = git('rev-parse', '--git-path', STAMP_FILE)[0];
    writeFileSync(stampPath, JSON.stringify(makeStamp({ head: git('rev-parse', 'HEAD')[0], dirty: git('status', '--porcelain').length > 0, ran: plan, relatedTests: !fullTests })) + '\n');
  } catch { /* no git directory to write to: the boxes just stay open */ }
}
reminder();
