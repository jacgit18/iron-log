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
    // The shared deploy steps are main's action, given main's scripts, and run in the app checkout only to take its source and git history.
    const deploy = steps.filter(s => s.includes('deploy-candidate'));
    expect(deploy).toHaveLength(1);
    expect(deploy[0]).toContain('uses: ./main/.github/actions/deploy-candidate');
    expect(deploy[0]).toContain('scripts: ${{ github.workspace }}/main/scripts');
    expect(deploy[0]).toContain('working-directory: ${{ github.workspace }}/app');
    expect(text).not.toContain('uses: ./.github/actions');
    // Main's build file, not the ref's.
    expect(text).toContain('CLOUDBUILD_CONFIG: ${{ github.workspace }}/main/cloudbuild.yaml');
  });

  it('the shared action runs only the scripts it is given, never a path of its own', () => {
    const action = readFileSync('.github/actions/deploy-candidate/action.yml', 'utf8');
    expect(action).toContain('"$SCRIPTS/deploy-cloud-run.sh" candidate');
    expect(action).toContain('"$SCRIPTS/ci-deploy.sh" smoke');
    expect(action).not.toMatch(/(?<![\w$/])scripts\/[\w.-]+\.(sh|mjs)/);
  });

  it('checks the QA mark before it migrates, and migrates before it deploys', () => {
    const at = (needle: string) => text.indexOf(needle);
    expect(at('qa-db.mjs check')).toBeGreaterThan(-1);
    expect(at('qa-db.mjs check')).toBeLessThan(at('dbmate'));
    expect(at('dbmate')).toBeLessThan(at('deploy-candidate'));
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
