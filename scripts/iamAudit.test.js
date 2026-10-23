import { execFile } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// scripts/iam-audit.sh is read-only by construction: with a stub `gcloud` that records every call, it only ever lists, describes or reads
// IAM policies, and never prints a secret value.
let dir; let log;
const STUB = `#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
case "$*" in
  *"projects get-iam-policy"*) echo '{"bindings":[{"role":"roles/run.developer","members":["serviceAccount:iron-log-deployer@p.iam.gserviceaccount.com","user:someone@example.com"]},{"role":"roles/secretmanager.secretAccessor","members":["serviceAccount:iron-log-run@p.iam.gserviceaccount.com"]},{"role":"roles/editor","members":["serviceAccount:123-compute@developer.gserviceaccount.com"]}]}';;
  *"run jobs list"*) [ -n "\${STUB_FAIL_LIST:-}" ] && exit 1; echo "iron-log-backup";;
  *"secrets list"*) [ -n "\${STUB_FAIL_LIST:-}" ] && exit 1; echo "iron-log-pii-key";;
  *"service-accounts list"*) [ -n "\${STUB_FAIL_LIST:-}" ] && exit 1; echo "iron-log-run@p.iam.gserviceaccount.com";;
  *"service-accounts get-iam-policy"*) echo "roles/iam.serviceAccountUser  serviceAccount:iron-log-deployer@p.iam.gserviceaccount.com";;
  *"describe"*) echo "iron-log-backup@p.iam.gserviceaccount.com";;
  *) echo "ROLE  MEMBERS";;
esac
`;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'iam-'));
  writeFileSync(join(dir, 'gcloud'), STUB); chmodSync(join(dir, 'gcloud'), 0o755);
  log = join(dir, 'calls'); writeFileSync(log, '');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const run = (extra = {}) => new Promise(done => {
  execFile('bash', [resolve('scripts/iam-audit.sh')], { env: { PATH: `${dir}:${process.env.PATH}`, PROJECT_ID: 'p', STUB_LOG: log, ...extra }, encoding: 'utf8' }, (err, stdout) => done({ status: err ? Number(err.code ?? 1) : 0, out: stdout }));
});

describe('iam-audit.sh', () => {
  it('lists the Iron Log service accounts with their project roles, the jobs, and the secrets', async () => {
    const r = await run();
    expect(r.status).toBe(0);
    expect(r.out).toContain('serviceAccount:iron-log-deployer@p.iam.gserviceaccount.com');
    expect(r.out).toContain('roles/run.developer');
    expect(r.out).toContain('serviceAccount:123-compute@developer.gserviceaccount.com'); // Google's default accounts too: they often hold broad roles
    expect(r.out).toContain('roles/editor');
    expect(r.out).not.toContain('someone@example.com'); // service accounts only, not people
    expect(r.out).toContain('-- job iron-log-backup');
    expect(r.out).toContain('-- iron-log-pii-key');
    expect(r.out).toContain('-- iron-log-run@p.iam.gserviceaccount.com'); // section 3: who may act as each account
    expect(r.out).toContain('roles/iam.serviceAccountUser');
    expect(r.out).toContain('Nothing was changed.');
  });
  it('makes only read calls: list, describe, get-iam-policy, never a write or a secret access', async () => {
    writeFileSync(log, '');
    await run(); // its own run, so this case does not depend on the one above
    const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
    expect(calls.length).toBeGreaterThan(5);
    for (const c of calls) {
      expect(c, c).toMatch(/\b(get-iam-policy|list|describe)\b/);
      expect(c, c).not.toMatch(/\b(add-iam-policy-binding|remove-iam-policy-binding|set-iam-policy|create|update|delete|add|disable|destroy|execute|access)\b/);
    }
  });
  it('says the report is INCOMPLETE and exits 1 when jobs or secrets cannot be listed (signed out), instead of reading as empty and clean', async () => {
    const r = await run({ STUB_FAIL_LIST: '1' });
    expect(r.status).toBe(1);
    expect(r.out).toContain('could not list the Cloud Run jobs');
    expect(r.out).toContain('could not list the secrets');
    expect(r.out).toContain('could not list the service accounts');
    expect(r.out).toContain('MISSING, not empty');
    expect(r.out).toContain('INCOMPLETE');
    expect(r.out).not.toContain('Done. Nothing was changed.');
  });
});
