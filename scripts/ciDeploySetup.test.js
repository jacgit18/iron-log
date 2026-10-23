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
  it('never grants anything on a job, or acts as the backup or parity accounts', () => {
    expect(code).not.toMatch(/run jobs add-iam-policy-binding/);
    expect(code).not.toContain('iron-log-backup');
    expect(code).not.toContain('iron-log-parity');
    // Acting as an account is granted only on the three runtime accounts and the build account.
    const actAs = [...code.matchAll(/service-accounts add-iam-policy-binding "\$(\w+)" --member "serviceAccount:\$SA" --role roles\/iam\.serviceAccountUser/g)].map(m => m[1]).sort();
    expect(actAs).toEqual(['BUILD_SA', 'QA_RUNTIME_SA', 'RUNTIME_SA', 'STAGING_RUNTIME_SA']);
  });
  it('never takes a role away on its own, and tells the owner how when the broad role is still held', () => {
    expect(code).not.toContain('remove-iam-policy-binding "$PROJECT_ID"');
    expect(text).toContain('NOTE: the deployer still holds the project-wide roles/run.developer');
  });
  it('does not claim the deployer cannot reach the database (the header says what it may and may not do)', () => {
    expect(text).not.toContain('It cannot read the database, the secrets or the backups');
    expect(text).toContain('It may start ONE job, the parity job');
  });
});

describe('the scripts you run by hand build as the build account', () => {
  it('backup-cloud-run.sh and parity-job.sh pass the build-only account to `gcloud builds submit`, as deploy-cloud-run.sh does', () => {
    for (const f of ['scripts/backup-cloud-run.sh', 'scripts/parity-job.sh', 'scripts/deploy-cloud-run.sh']) {
      const src = readFileSync(f, 'utf8');
      const submit = src.split('\n').find(l => /gc builds submit/.test(l)) ?? '';
      expect(submit, f).toContain('build_as[@]');
      expect(src, f).toContain('iron-log-build@${PROJECT_ID}.iam.gserviceaccount.com');
    }
  });
});
