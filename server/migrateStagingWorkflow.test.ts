import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The "Migrate staging" workflow (brief staging-migrates-on-merge) holds the staging owner database URL, so what starts it and what it may touch
// is pinned here: a push to main that changes migrations, or a person on main; only the staging environment and secret; the staging mark checked
// before any migration; no Google login. Read as text: no YAML library.
const text = readFileSync('.github/workflows/migrate-staging.yml', 'utf8');
const parity = readFileSync('.github/workflows/env-parity.yml', 'utf8');
const deploy = readFileSync('.github/workflows/deploy-cloud-run.yml', 'utf8');
const at = (needle: string) => text.indexOf(needle);

describe('the Migrate staging workflow', () => {
  it('starts on a push to main that changes migrations, or by hand, and nothing else', () => {
    const on = text.slice(text.indexOf('\non:\n'), text.indexOf('\npermissions:'));
    expect(on).toContain('push:');
    expect(on).toMatch(/branches: \[main\]/);
    expect(on).toMatch(/paths:\s*\n\s*- 'db\/migrations\/\*\*'/);
    expect(on).toContain('workflow_dispatch:');
    for (const other of ['pull_request', 'workflow_run:', 'schedule:', 'repository_dispatch']) expect(on).not.toContain(other);
  });

  it('runs only on main, and only while staging is set up', () => {
    expect(text).toContain("if: github.ref == 'refs/heads/main' && vars.STAGING_ENABLED == 'true'");
  });

  it('uses the staging environment and its secret only, with no Google login and no other environment', () => {
    expect(text).toContain('environment: staging');
    expect(text).toContain('secrets.STAGING_DATABASE_URL');
    for (const other of ['QA_DATABASE_URL', 'MIGRATIONS_CHECK_URL', 'PROD_DATABASE_URL', 'environment: production', 'environment: qa']) expect(text, other).not.toContain(other);
    expect(text).not.toContain('google-github-actions');
    expect(text).not.toContain('id-token');
    expect(text).toContain('permissions:\n  contents: read\n');
  });

  it('checks the staging mark before it migrates, and migrates the repository\'s migrations', () => {
    expect(at('node scripts/staging-db.mjs check')).toBeGreaterThan(-1);
    expect(at('node scripts/staging-db.mjs check')).toBeLessThan(at('npx dbmate'));
    expect(at('npm ci --ignore-scripts')).toBeLessThan(at('node scripts/staging-db.mjs check'));
    expect(text).toContain('npx dbmate --no-dump-schema --migrations-dir db/migrations up');
    // The URL reaches each step only as an environment variable, never in a command line.
    for (const line of text.split('\n').filter(l => l.includes('secrets.STAGING_DATABASE_URL'))) expect(line).toMatch(/^\s+(STAGING_DATABASE_URL|DATABASE_URL): /);
  });

  it('runs one at a time and never cancels a run halfway, in its own group (not the staging deploy job\'s)', () => {
    expect(text).toMatch(/concurrency:\n  group: migrate-staging\n  cancel-in-progress: false/);
    expect(deploy).not.toContain('group: migrate-staging');
  });
});

describe('the parity report after this workflow', () => {
  it('makes staging BEHIND red, because staging now migrates on every merge', () => {
    expect(parity).toContain('PARITY_STAGING_BEHIND: fail');
  });
});
