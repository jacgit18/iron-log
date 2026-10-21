// Guards the routing in scripts/ci-changes.mjs: which Tests jobs a pull request runs for which changed files.
// A wrong line there silently skips a check (a replaced `database` line once would have), so each job is pinned to files that must select it.
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const JOBS = ['unit', 'e2e', 'e2e_sync', 'database', 'backup', 'docker'];
const run = (files, env = {}) => {
  const out = execFileSync('node', ['scripts/ci-changes.mjs', `--files=${files.join(',')}`], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '', ...env } });
  return JOBS.filter(j => new RegExp(`^${j}\\s+true$`, 'm').test(out));
};

describe('ci-changes', () => {
  it.each([
    [['docs/a.md', '.github/CODEOWNERS'], []],
    [['README.md'], ['unit']],
    [['SETUP.md'], ['unit']],
    [['scripts/pr-body.mjs'], ['unit']],
    [['.github/pull_request_template.md'], ['unit']],
    [['e2e/a.spec.js'], ['unit', 'e2e']],
    [['src/components/Foo.tsx'], ['unit', 'e2e', 'docker']],
    [['src/styles.css'], ['unit', 'e2e', 'docker']],
    [['src/sync/x.ts'], ['unit', 'e2e', 'e2e_sync', 'docker']],
    [['src/shared/validate.ts'], ['unit', 'e2e', 'e2e_sync', 'docker']],
    [['server/routes.ts'], ['unit', 'e2e_sync', 'docker']],
    [['db/migrations/1.sql'], ['unit', 'e2e_sync', 'database', 'backup']],
    [['server/db/types.ts'], ['unit', 'e2e_sync', 'database', 'docker']],
    [['backup/run.sh'], ['unit', 'backup', 'docker']],
    [['Dockerfile'], ['unit', 'docker']],
    [['package.json'], JOBS],
    [['.github/workflows/test.yml'], JOBS],
    [['neon.ts'], JOBS],
  ])('%j runs %j', (files, jobs) => {
    expect(run(files)).toEqual(jobs);
  });

  it('runs every job outside a pull request', () => {
    const out = execFileSync('node', ['scripts/ci-changes.mjs'], { encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_OUTPUT: '' } });
    for (const j of JOBS) expect(out).toMatch(new RegExp(`^${j}\\s+true$`, 'm'));
  });
});
