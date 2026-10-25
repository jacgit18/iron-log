import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// scripts/ci-deploy-setup.sh gives the CI deployer its rights. After the 2026-10-23 audit (deployer rights) it must not hand out the
// project-wide run.developer role, which includes starting any job with overridden arguments, and must not touch the backup job or account.
// Read as text.
const text = readFileSync('scripts/ci-deploy-setup.sh', 'utf8');
const lines = text.split('\n').filter(l => !l.trim().startsWith('#'));
const code = lines.join('\n');

describe('ci-deploy-setup.sh', () => {
  it('grants the viewer role at the project, not the developer role', () => {
    const loop = code.match(/for role in ([^;]+); do/)?.[1] ?? '';
    expect(loop).toContain('roles/run.viewer');
    expect(loop).not.toContain('roles/run.developer');
    expect(code).not.toMatch(/projects add-iam-policy-binding[^\n]*roles\/run\.developer/);
  });
  it('grants the developer role on each of the three services only, when they exist', () => {
    expect(code).toContain('for svc in iron-log iron-log-staging iron-log-qa; do');
    expect(code).toMatch(/run services add-iam-policy-binding "\$svc" --region "\$REGION" --member "serviceAccount:\$SA" --role roles\/run\.developer/);
    expect(code).toContain('run services describe "$svc"');
  });
  it('grants on a job only run-without-overrides, on the backup job and the migrate job, and never acts as their accounts', () => {
    const jobGrants = code.split('\n').filter(l => /run jobs add-iam-policy-binding/.test(l));
    expect(jobGrants).toHaveLength(2);
    expect(jobGrants.map(l => l.match(/binding (iron-log-[a-z]+)/)?.[1]).sort()).toEqual(['iron-log-backup', 'iron-log-migrate']);
    for (const g of jobGrants) {
      expect(g).toContain('--role roles/run.jobsExecutor ');
      expect(g).not.toMatch(/WithOverrides|run\.developer|run\.admin/);
    }
    expect(code).not.toContain('iron-log-parity');
    expect(code).not.toMatch(/iam\.serviceAccountUser[^\n]*iron-log-(backup|migrate)|iron-log-(backup|migrate)@[^\n]*serviceAccountUser/);
    // Acting as an account is granted only on the three runtime accounts and the build account.
    const actAs = [...code.matchAll(/service-accounts add-iam-policy-binding "\$(\w+)" --member "serviceAccount:\$SA" --role roles\/iam\.serviceAccountUser/g)].map(m => m[1]).sort();
    expect(actAs).toEqual(['BUILD_SA', 'QA_RUNTIME_SA', 'RUNTIME_SA', 'STAGING_RUNTIME_SA']);
  });
  it('lets the deployer write the migrate job\'s bucket and no secret (it never reads the owner login)', () => {
    const bucketGrants = code.split('\n').filter(l => /storage buckets add-iam-policy-binding "gs:\/\/\$\{MIGRATIONS_BUCKET\}"/.test(l));
    expect(bucketGrants).toHaveLength(1);
    expect(bucketGrants[0]).toContain('--role roles/storage.objectUser');
    expect(code).not.toMatch(/secrets add-iam-policy-binding|secretmanager\.secretAccessor/);
  });
  it('never takes a role away on its own, and tells the owner how when the broad role is still held', () => {
    expect(code).not.toContain('remove-iam-policy-binding "$PROJECT_ID"');
    expect(text).toContain('NOTE: the deployer still holds the project-wide roles/run.developer');
  });
  it('does not claim the deployer cannot reach the database (the header says what it may and may not do)', () => {
    expect(text).not.toContain('It cannot read the database, the secrets or the backups');
    expect(text).toContain('may start the parity job with arguments');
  });
});

describe('the scripts you run by hand build as the build account', () => {
  it('backup-cloud-run.sh, parity-job.sh and migrate-job.sh pass the build-only account to `gcloud builds submit`, as deploy-cloud-run.sh does', () => {
    for (const f of ['scripts/backup-cloud-run.sh', 'scripts/parity-job.sh', 'scripts/migrate-job.sh', 'scripts/deploy-cloud-run.sh']) {
      const src = readFileSync(f, 'utf8');
      const submit = src.split('\n').find(l => /gc builds submit/.test(l)) ?? '';
      expect(submit, f).toContain('build_as[@]');
      expect(src, f).toContain('iron-log-build@${PROJECT_ID}.iam.gserviceaccount.com');
    }
  });
});
