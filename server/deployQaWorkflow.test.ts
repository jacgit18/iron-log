import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The QA workflow runs a branch's code on the deployer's rights (ADR 060), so what it may run from that branch is pinned here: it is started
// by hand and only from main, every script and database tool comes from a separate checkout of main, and the checkout of the ref supplies the
// app source and its migrations and nothing that runs. Read as text: no YAML library.
const text = readFileSync('.github/workflows/deploy-qa.yml', 'utf8');
// The steps of the one job, each as its own block of text.
const steps = text.slice(text.indexOf('    steps:')).split(/\n(?=      - )/).slice(1);

describe('the QA workflow (ADR 060)', () => {
  it('starts only by hand, and only from main', () => {
    const on = text.slice(text.indexOf('\non:\n'), text.indexOf('\npermissions:'));
    expect(on).toContain('workflow_dispatch:');
    for (const other of ['push:', 'pull_request', 'workflow_run:', 'schedule:', 'repository_dispatch']) expect(on).not.toContain(other);
    expect(text).toContain("if: github.ref == 'refs/heads/main'");
  });

  it('checks out main for the tools and the ref for the app only', () => {
    const checkouts = steps.filter(s => s.includes('actions/checkout'));
    expect(checkouts).toHaveLength(2);
    expect(checkouts[0]).toMatch(/ref: main\n\s+path: main/);
    expect(checkouts[1]).toContain('path: app');
    expect(checkouts[1]).toContain("ref: ${{ inputs.ref || 'main' }}");
  });

  it('runs every script and the database tools from the main checkout, never from the ref', () => {
    for (const step of steps) {
      const runs = step.includes('run:') ? step.slice(step.indexOf('run:')) : '';
      // A script path counts as main's only as $GITHUB_WORKSPACE/main/... or with working-directory: main.
      const bare = [...runs.matchAll(/(?<!main\/)(?<![\w/])scripts\/[\w.-]+/g)];
      if (bare.length) expect(step, runs).toContain('working-directory: main');
      if (/\bnpx dbmate\b|\bnpm ci\b/.test(runs)) expect(step, runs).toContain('working-directory: main');
    }
    // The only thing run in the app checkout is main's script, for its source and git history.
    const inApp = steps.filter(s => s.includes('working-directory: app'));
    expect(inApp.length).toBeGreaterThan(0);
    for (const step of inApp) expect(step).toContain('$GITHUB_WORKSPACE/main/scripts/');
  });

  it('checks the QA mark before it migrates, and migrates before it deploys', () => {
    const at = (needle: string) => text.indexOf(needle);
    expect(at('qa-db.mjs check')).toBeGreaterThan(-1);
    expect(at('qa-db.mjs check')).toBeLessThan(at('dbmate'));
    expect(at('dbmate')).toBeLessThan(at('deploy-cloud-run.sh" candidate'));
    expect(text).toContain('--migrations-dir ../app/db/migrations');
  });

  it('uses the qa environment and the QA service', () => {
    expect(text).toContain('environment: qa');
    expect(text).toContain('IRON_LOG_ENV: qa');
    expect(text).toContain('SERVICE: iron-log-qa');
    expect(text).toContain('QA_DATABASE_URL');
    expect(text).not.toContain('STAGING_DATABASE_URL');
  });
});
