import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Production migrates inside the approved deploy (brief production-migrates-in-deploy). The production job of deploy-cloud-run.yml holds the
// production owner URL, so what it does with it, and in which order, is pinned here. Read as text: no YAML library.
const all = readFileSync('.github/workflows/deploy-cloud-run.yml', 'utf8');
const job = all.slice(all.indexOf('\n  deploy:\n'), all.indexOf('\n  release:\n'));
const stagingJob = all.slice(all.indexOf('\n  staging:\n'), all.indexOf('\n  deploy:\n'));
const at = (needle: string) => job.indexOf(needle);
const step = (name: string) => {
  const start = job.indexOf(`- name: ${name}\n`);
  expect(start, name).toBeGreaterThan(-1);
  const next = job.indexOf('\n      - ', start + 5);
  return job.slice(start, next < 0 ? undefined : next);
};

describe('the production job migrates production after the approval', () => {
  it('is the production environment, and the old box and fallback are gone', () => {
    expect(job).toContain('environment: production');
    expect(all).not.toContain('migrations_applied');
    expect(all).not.toContain('HAS_MIGRATIONS_CHECK');
    expect(all).not.toContain('pending-migrations');
  });

  it('asks the database, refuses a destructive migration, checks the login, backs up, applies, checks none is left, then builds', () => {
    const order = ['Which migrations are waiting', 'Refuse a destructive migration', "Check the owner login is production's database", 'Back up production first', 'Apply the migrations to production', 'Check production has none left', 'Build and deploy the new revision with no traffic'].map(n => at(`- name: ${n}`));
    for (const o of order) expect(o).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(at('- name: What is live now')).toBeLessThan(order[0]!);
  });

  it('does the backup, the login check, the apply and the final check only when a migration is waiting', () => {
    for (const n of ['Refuse a destructive migration', "Check the owner login is production's database", 'Back up production first', 'Apply the migrations to production', 'Check production has none left'])
      expect(step(n), n).toContain("if: steps.waiting.outputs.any == 'true'");
    expect(step('Which migrations are waiting')).not.toContain('if:');
  });

  it('runs the backup job and waits, with no overridden arguments, and applies with dbmate on the repository migrations', () => {
    expect(step('Back up production first')).toContain('gcloud run jobs execute iron-log-backup --project "$PROJECT_ID" --region "$REGION" --wait');
    expect(step('Back up production first')).not.toMatch(/--args|--update-env-vars|--container/);
    expect(step('Apply the migrations to production')).toContain('npx dbmate --no-dump-schema --migrations-dir db/migrations up');
    expect(step('Refuse a destructive migration')).toContain('scripts/migration-guard.mjs');
    expect(step("Check the owner login is production's database")).toContain('node scripts/same-database.mjs');
  });

  it('never lets a failed step carry on: no continue-on-error in the production job, and the waiting check fails when it cannot ask', () => {
    expect(job).not.toContain('continue-on-error');
    expect(step('Which migrations are waiting')).toContain('MIGRATIONS_CHECK_URL (a read-only login on production');
    expect(step('Which migrations are waiting')).toMatch(/Could not ask the database[\s\S]*exit 1/);
  });

  it('reads the production owner URL only in this job, only as an environment variable, and nowhere else', () => {
    const uses = all.split('\n').filter(l => l.includes('PRODUCTION_DATABASE_URL'));
    expect(uses.length).toBeGreaterThan(0);
    for (const l of uses) expect(l, l).toMatch(/^\s+(OWNER_URL|DATABASE_URL): \$\{\{ secrets\.PRODUCTION_DATABASE_URL \}\}$/);
    expect(stagingJob).not.toContain('PRODUCTION_DATABASE_URL');
    for (const f of readdirSync('.github/workflows').filter(f => f !== 'deploy-cloud-run.yml')) expect(readFileSync(join('.github/workflows', f), 'utf8'), f).not.toContain('PRODUCTION_DATABASE_URL');
  });
});
