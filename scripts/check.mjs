// Runs the checks that fit what changed, so a docs edit does not wait for Playwright and a sync change does not skip it.
// Usage: npm run check            run the checks for the files changed against origin/main (committed, staged and unstaged)
//        npm run check -- --list  show which checks it would run and why, without running them
//        npm run check -- --files=a,b  pretend only those files changed (with --list, to see what a change would run)
//        npm run check -- --all   run every check that does not need a database (typecheck, test, lint, e2e)
// CI (.github/workflows/test.yml) runs everything on main and the jobs scripts/ci-changes.mjs picks on a pull request; this is the local shortcut. A file it does not recognise runs everything.
// The db:check and e2e:sync steps need the local Postgres: it is started (npm run db:start) and used when DATABASE_URL is not set; if it cannot be reached the step is not run and the script exits 1.
import { execFileSync, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';

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

const is = {
  docs: f => /\.md$/.test(f) || f.startsWith('docs/') || f.startsWith('.github/') || f === 'LICENSE',
  unitTest: f => /\.test\.(js|ts|tsx|jsx)$/.test(f) || f.startsWith('src/test/'),
  e2eSpec: f => f.startsWith('e2e/') || f.startsWith('e2e-accounts/'),
  css: f => /\.css$/.test(f),
  sync: f => f.startsWith('src/sync/') || f.startsWith('src/shared/') || f.startsWith('server/') || f.startsWith('src/store/') || f.startsWith('e2e-sync/') || f === 'playwright.sync.config.js',
  migration: f => f.startsWith('db/migrations/') || f === 'server/db/types.ts',
  ui: f => f.startsWith('src/components/') || f.startsWith('src/hooks/') || f.startsWith('src/store/') || /\.(jsx|tsx)$/.test(f),
  src: f => f.startsWith('src/') || f.startsWith('server/') || f.startsWith('public/') || f === 'index.html',
  script: f => f.startsWith('scripts/') || f.startsWith('tools/') || f.startsWith('spike/'),
  tooling: f => /^(package(-lock)?\.json|tsconfig.*\.json|vite\.config\.js|playwright.*\.js|\.oxlintrc.*|Dockerfile|neon\.ts)$/.test(f),
};

const checks = new Map(); // name -> why
const want = (name, why) => checks.has(name) || checks.set(name, why);
const ALL = ['typecheck', 'test', 'lint', 'e2e'];
// The unit step runs only the tests related to the changed files (scripts/unit-tests.mjs) unless everything is asked for: --all, a tooling or dependency file, or a file this script does not know.
let fullTests = args.includes('--all');

if (args.includes('--all')) {
  ALL.forEach(c => want(c, '--all'));
} else if (!files.length) {
  console.log(`Nothing changed against ${baseRef}: no checks to run.`);
  process.exit(0);
} else {
  for (const f of files) {
    if (is.docs(f)) continue;
    if (is.tooling(f)) { fullTests = true; ALL.forEach(c => want(c, `${f} is tooling or a dependency file`)); }
    else if (is.unitTest(f)) {
      want('test', `${f} is a unit test`);
      want('lint', `${f} is a unit test`);
      if (/\.tsx?$/.test(f)) want('typecheck', `${f} is typed`);
    } else if (is.e2eSpec(f)) {
      want('lint', `${f} is a browser test`);
      want('e2e', `${f} is a browser test`);
    } else if (is.script(f)) {
      want('lint', `${f} is a helper script`);
      want('test', `${f} is a helper script (only the tests that import it run)`);
    } else if (is.migration(f)) {
      want('db:check', `${f} changes the schema`);
      want('typecheck', `${f} changes the schema`);
    } else if (is.css(f)) {
      want('e2e', `${f} is styling (e2e builds the app first)`);
      want('lint', `${f} is styling (lint checks its format)`);
    } else if (is.src(f) || /\.(mjs|js|ts)$/.test(f)) {
      ['typecheck', 'test', 'lint'].forEach(c => want(c, `${f} is source`));
      if (is.ui(f)) want('e2e', `${f} is UI or store code`);
      else want('build', `${f} is source`);
      if (is.sync(f)) {
        want('e2e', `${f} is on the sync or server path`);
        want('e2e:sync', `${f} is on the sync or server path`);
        want('db:check', `${f} is on the sync or server path`);
      }
    } else {
      fullTests = true;
      ALL.forEach(c => want(c, `${f} is not a file this script knows, so everything runs`));
    }
  }
  // e2e builds the app itself (playwright.config.js webServer), so a separate build adds nothing when it runs.
  if (checks.has('e2e')) checks.delete('build');
}

const order = ['typecheck', 'lint', 'test', 'build', 'db:check', 'e2e', 'e2e:sync'];
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
  console.log(related ? '\n> node scripts/unit-tests.mjs (the tests related to what changed)' : `\n> npm run ${c}`);
  const r = spawnSync(...(related ? ['node', ['scripts/unit-tests.mjs', `--base=${baseRef}`]] : ['npm', ['run', c]]), { stdio: 'inherit', env: { ...process.env, FRESH_SERVER: '1' } });
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
reminder();
