// Which local checks a set of changed files needs (used by scripts/check.mjs; tested in scripts/checkPlan.test.js).
// CI decides its jobs in scripts/ci-changes.mjs; where CI runs a browser job for a path, this plans e2e too, so a push does not turn red in CI for a check the hook skipped.
// Not matched locally: the docker image job (needs the docker daemon; CI runs it for src/, server/, public/, Dockerfile) and the backup job.

import { existsSync } from 'node:fs';

export const is = {
  // Docs and repo metadata that no check reads. The workflow files, composite actions and pr-kit.json are not docs: they are checked by `workflows`.
  // README.md and SETUP.md carry a generated table of contents that `npm run lint` checks (scripts/doc-toc.mjs), so they are not plain docs.
  tocDoc: f => f === 'README.md' || f === 'SETUP.md',
  docs: f => f !== '.github/pull_request_template.md' && !is.tocDoc(f) && !is.workflow(f) && (/\.md$/.test(f) || f.startsWith('docs/') || f.startsWith('.github/') || f === 'LICENSE'),
  workflow: f => f.startsWith('.github/workflows/') || f.startsWith('.github/actions/') || f === '.github/pr-kit.json',
  unitTest: f => /\.test\.(js|ts|tsx|jsx)$/.test(f) || f.startsWith('src/test/'),
  e2eSpec: f => f.startsWith('e2e/') || f.startsWith('e2e-accounts/'),
  css: f => /\.css$/.test(f),
  sync: f => f.startsWith('src/sync/') || f.startsWith('src/shared/') || f.startsWith('server/') || f.startsWith('src/store/') || f.startsWith('e2e-sync/') || f === 'playwright.sync.config.js',
  migration: f => f.startsWith('db/migrations/') || f === 'server/db/types.ts',
  ui: f => f.startsWith('src/components/') || f.startsWith('src/hooks/') || f.startsWith('src/store/') || /\.(jsx|tsx)$/.test(f),
  src: f => f.startsWith('src/') || f.startsWith('server/') || f.startsWith('public/') || f === 'index.html',
  // CI runs the browser tests for these (scripts/ci-changes.mjs `e2e`).
  browserApp: f => f.startsWith('src/') || f.startsWith('public/') || f === 'index.html',
  script: f => f.startsWith('scripts/') || f.startsWith('tools/') || f.startsWith('spike/'),
  tooling: f => /^(package(-lock)?\.json|tsconfig.*\.json|vite\.config\.js|playwright.*\.js|\.oxlintrc.*|Dockerfile|neon\.ts)$/.test(f),
};

export const ALL = ['typecheck', 'test', 'lint', 'workflows', 'e2e'];

/** { checks: Map<name, why>, fullTests, e2eSpecs } for the changed files (`all` = the --all flag).
 *  `e2eSpecs` lists the browser specs to run when the only reason for e2e is that those specs changed; null means the whole suite.
 *  Playwright's --only-changed follows imports, and a spec never imports the app code it drives, so a source or style change cannot be mapped to specs: it keeps the full suite. */
export function planChecks(files, all = false) {
  const checks = new Map();
  // `scoped` marks an e2e request that names its own specs; any other e2e request wants the whole suite.
  const want = (name, why, scoped = false) => {
    if (name === 'e2e' && !scoped) e2eFull = true;
    if (!checks.has(name)) checks.set(name, why);
  };
  let fullTests = all;
  let e2eFull = false;
  const specs = [];
  if (all) {
    ALL.forEach(c => want(c, '--all'));
    return { checks, fullTests, e2eSpecs: null };
  }
  for (const f of files) {
    if (is.docs(f)) continue;
    if (is.workflow(f)) {
      want('workflows', `${f} is a CI definition (parsed; actionlint when installed)`);
      if (f === '.github/pr-kit.json') { want('test', `${f} is read by the PR description tests`); want('lint', `${f} is read by the PR description tests`); }
    } else if (is.tooling(f)) { fullTests = true; ALL.forEach(c => want(c, `${f} is tooling or a dependency file`)); }
    else if (is.unitTest(f)) {
      want('test', `${f} is a unit test`);
      want('lint', `${f} is a unit test`);
      if (/\.tsx?$/.test(f)) want('typecheck', `${f} is typed`);
    } else if (is.e2eSpec(f)) {
      want('lint', `${f} is a browser test`);
      // Only a spec file directly in e2e/ runs alone; a fixture or helper (or e2e-accounts/) can change many specs, so it runs them all.
      const alone = /^e2e\/[^/]+\.spec\.[jt]s$/.test(f) && existsSync(f);
      if (alone) specs.push(f);
      want('e2e', `${f} is a browser test`, alone);
    } else if (is.tocDoc(f)) {
      want('lint', `${f} has a generated table of contents (npm run docs:toc)`);
    } else if (is.script(f) || f === '.github/pull_request_template.md') {
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
      if (is.ui(f) || is.browserApp(f)) want('e2e', `${f} is ${is.ui(f) ? 'UI or store code' : 'app code, public/ or the page shell (CI runs the browser tests for it)'}`);
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
  return { checks, fullTests, e2eSpecs: checks.has('e2e') && !e2eFull && specs.length ? [...new Set(specs)] : null };
}
