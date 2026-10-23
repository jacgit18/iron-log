import { execFile } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// scripts/parity-run.sh (what the Environment parity workflow runs) with a stub `gcloud`: each job result becomes a status, a missing or
// unreadable result is UNKNOWN (never OK), and only AHEAD OF MAIN and UNKNOWN (and staging BEHIND when asked) turn the run red.
let dir; let bin; let migrations;
const STUB = `#!/usr/bin/env bash
# args seen: run jobs execute JOB --region R --args "env,list" --wait | run jobs executions list ... | run jobs executions tasks list --execution NAME ...
echo "$*" >> "$STUB_DIR/calls"
case "$*" in
  *"jobs execute"*)
    args=""; prev=""; for a in "$@"; do [ "$prev" = "--args" ] && args="$a"; prev="$a"; done
    env="\${args%%,*}"; echo "$env" > "$STUB_DIR/last"; echo "$args" >> "$STUB_DIR/args"
    v="STUB_RC_$(echo "$env" | tr a-z A-Z)"; exit "\${!v:-0}";;
  *"executions tasks list"*)
    env="$(sed 's/^exec-//' <<< "$(grep -o 'exec-[a-z]*' <<< "$*" | head -1)")"
    v="STUB_EXIT_$(echo "$env" | tr a-z A-Z)"
    if [ -n "\${!v:-}" ]; then echo "[{\\"status\\":{\\"lastAttemptResult\\":{\\"exitCode\\":\${!v}}}}]"; else echo "[{}]"; fi;;
  *"executions list"*) echo "exec-$(cat "$STUB_DIR/last")";;
esac
`;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'parity-'));
  bin = join(dir, 'bin'); mkdirSync(bin);
  writeFileSync(join(bin, 'gcloud'), STUB); chmodSync(join(bin, 'gcloud'), 0o755);
  migrations = join(dir, 'migrations'); mkdirSync(migrations);
  for (const f of ['20261001000001_a.sql', '20261002000001_b.sql', 'README.md']) writeFileSync(join(migrations, f), '');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const go = (env = {}, migrationsDir = migrations) => {
  const stubDir = mkdtempSync(join(dir, 'run-'));
  const summary = join(stubDir, 'summary.md');
  writeFileSync(summary, '');
  return new Promise(done => {
    execFile('bash', [resolve('scripts/parity-run.sh')], { env: { PATH: `${bin}:${process.env.PATH}`, PROJECT_ID: 'p', MIGRATIONS_DIR: migrationsDir, STUB_DIR: stubDir, GITHUB_STEP_SUMMARY: summary, ...env }, encoding: 'utf8' }, (err, stdout, stderr) =>
      done({ status: err ? Number(err.code ?? 1) : 0, out: stdout + stderr, summary: readFileSync(summary, 'utf8'), args: (() => { try { return readFileSync(join(stubDir, 'args'), 'utf8').trim().split('\n'); } catch { return []; } })() }));
  });
};

describe('parity-run.sh', () => {
  it('passes main\'s migration versions to the job, once per environment, and is green when all match', async () => {
    const r = await go();
    expect(r.status).toBe(0);
    expect(r.args).toEqual(['production,20261001000001,20261002000001', 'staging,20261001000001,20261002000001', 'qa,20261001000001,20261002000001']);
    expect(r.summary).toContain('| production | OK |');
    expect(r.summary).toContain('| staging | OK |');
    expect(r.summary).toContain('| qa | OK |');
    expect(r.summary).toContain('main has 2 migrations');
  });
  it('shows BEHIND as a warning, not a failure, for production, staging and QA', async () => {
    const r = await go({ STUB_RC_PRODUCTION: '1', STUB_EXIT_PRODUCTION: '3', STUB_RC_STAGING: '1', STUB_EXIT_STAGING: '3' });
    expect(r.status).toBe(0);
    expect(r.summary).toContain('| production | BEHIND |');
    expect(r.summary).toContain('| staging | BEHIND |');
    expect(r.out).toContain('::warning title=production is behind main');
  });
  it('fails on AHEAD OF MAIN', async () => {
    const r = await go({ STUB_RC_QA: '1', STUB_EXIT_QA: '4' });
    expect(r.status).toBe(1);
    expect(r.summary).toContain('| qa | AHEAD OF MAIN |');
    expect(r.out).toContain('::error title=qa: AHEAD OF MAIN');
  });
  it('fails on UNKNOWN: a job that failed without a readable result, or reported 2, is never OK', async () => {
    const noCode = await go({ STUB_RC_PRODUCTION: '1' });
    expect(noCode.status).toBe(1);
    expect(noCode.summary).toContain('| production | UNKNOWN |');
    const two = await go({ STUB_RC_STAGING: '1', STUB_EXIT_STAGING: '2' });
    expect(two.status).toBe(1);
    expect(two.summary).toContain('| staging | UNKNOWN |');
  });
  it('makes staging BEHIND a failure when PARITY_STAGING_BEHIND=fail (once staging migrates on every merge)', async () => {
    const r = await go({ PARITY_STAGING_BEHIND: 'fail', STUB_RC_STAGING: '1', STUB_EXIT_STAGING: '3' });
    expect(r.status).toBe(1);
    expect(r.out).toContain('::error title=staging is behind main');
  });
  it('fails when there is no migration list to compare with', async () => {
    const empty = mkdtempSync(join(dir, 'empty-'));
    const r = await go({}, empty);
    expect(r.status).toBe(1);
    expect(r.out).toContain('No migration files found');
  });
});
