import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Production migrates inside the approved deploy (briefs production-migrates-in-deploy and production-migrate-job). The production job of
// deploy-cloud-run.yml hands the migrations to the migrate job, which holds the owner login in Secret Manager; GitHub holds no owner URL for
// production. The order of the steps is pinned here. Read as text: no YAML library.
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

  it('asks the database, refuses a destructive migration, backs up, hands over the files, runs the job, checks none is left, then builds', () => {
    const order = ['Which migrations are waiting', 'Refuse a destructive migration', 'Back up production first', 'Hand the migrations to the job', 'Apply the migrations to production', 'Check production has none left', 'Build and deploy the new revision with no traffic'].map(n => at(`- name: ${n}`));
    for (const o of order) expect(o).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(at('- name: What is live now')).toBeLessThan(order[0]!);
  });

  it('does the backup, the hand-over, the job and the final check only when a migration is waiting', () => {
    for (const n of ['Refuse a destructive migration', 'Back up production first', 'Hand the migrations to the job', 'Apply the migrations to production', 'Check production has none left'])
      expect(step(n), n).toContain("if: steps.waiting.outputs.any == 'true'");
    expect(step('Which migrations are waiting')).not.toContain('if:');
  });

  it('runs the backup job and the migrate job and waits, both with no overridden arguments', () => {
    expect(step('Back up production first')).toContain('gcloud run jobs execute iron-log-backup --project "$PROJECT_ID" --region "$REGION" --wait');
    expect(step('Apply the migrations to production')).toContain('gcloud run jobs execute iron-log-migrate --project "$PROJECT_ID" --region "$REGION" --wait');
    for (const n of ['Back up production first', 'Apply the migrations to production']) expect(step(n), n).not.toMatch(/--args|--update-env-vars|--set-env-vars|--container|--command/);
    expect(step('Refuse a destructive migration')).toContain('scripts/migration-guard.mjs');
  });

  it('hands over the repository migrations to the private bucket, then the commit, and runs no database tool or owner login itself', () => {
    const hand = step('Hand the migrations to the job');
    expect(hand).toContain('gcloud storage rsync db/migrations "$bucket" --recursive --delete-unmatched-destination-objects');
    expect(hand).toContain('bucket="gs://${PROJECT_ID}-iron-log-migrations/current"');
    expect(hand.indexOf('rsync')).toBeLessThan(hand.indexOf('COMMIT')); // the sync deletes unmatched objects, so the marker goes in after it
    expect(job).not.toContain('dbmate');
    expect(job).not.toContain('same-database');
  });

  it('never lets a failed step carry on: no continue-on-error in the production job, and the waiting check fails when it cannot ask', () => {
    expect(job).not.toContain('continue-on-error');
    expect(step('Which migrations are waiting')).toContain('MIGRATIONS_CHECK_URL (a read-only login on production');
    expect(step('Which migrations are waiting')).toMatch(/Could not ask the database[\s\S]*exit 1/);
  });

  it('keeps no production owner URL in GitHub: not in any workflow, and the read-only login is the only database secret the production job reads', () => {
    for (const f of readdirSync('.github/workflows')) expect(readFileSync(join('.github/workflows', f), 'utf8'), f).not.toContain('PRODUCTION_DATABASE_URL');
    const secretsInJob = [...job.matchAll(/secrets\.([A-Z][A-Z0-9_]*)/g)].map(m => m[1]);
    expect([...new Set(secretsInJob)]).toEqual(['MIGRATIONS_CHECK_URL']);
    expect(stagingJob).not.toContain('MIGRATIONS_CHECK_URL');
  });
});
