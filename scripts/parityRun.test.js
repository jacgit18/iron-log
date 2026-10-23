import { execFile } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// scripts/parity-run.sh (what the Environment parity workflow runs) with a stub `gcloud`: each job result becomes a status, a missing or
// unreadable result is UNKNOWN (never OK), and only AHEAD OF MAIN and UNKNOWN (and staging BEHIND when asked) turn the run red.
let dir; let bin; let migrations;
const STUB = `#!/usr/bin/env bash
# Models real gcloud (checked 2026-10-23): a failed job prints nothing on stdout for --format=value(metadata.name); its error text says
# "Task <execution>-task0 failed with exit code: N" and "gcloud run jobs executions describe <execution>". Executions are named <job>-<5 chars>.
echo "$*" >> "$STUB_DIR/calls"
name_of() { echo "iron-log-parity-$(printf '%s' "$1xxxxx" | cut -c1-5)"; }
env_of() { case "$1" in *-produ*) echo PRODUCTION;; *-stagi*) echo STAGING;; *-qaxxx*) echo QA;; *-secre*) echo SECRETS;; esac; }
case "$*" in
  *"jobs execute"*)
    args=""; prev=""; for a in "$@"; do [ "$prev" = "--args" ] && args="$a"; prev="$a"; done
    env="\${args%%,*}"; up="$(echo "$env" | tr a-z A-Z)"
    ns="STUB_NOSTART_$up"; [ -n "\${!ns:-}" ] && { echo "ERROR: (gcloud.run.jobs.execute) PERMISSION_DENIED" >&2; exit 1; }   # no execution exists
    echo "$args" >> "$STUB_DIR/args"
    n="$(name_of "$env")"
    v="STUB_RC_$up"; rc="\${!v:-0}"
    if [ "$rc" = 0 ]; then echo "$n"; exit 0; fi
    x="STUB_EXIT_$up"; nt="STUB_NOTEXT_$up"
    if [ -n "\${!x:-}" ] && [ -z "\${!nt:-}" ]; then echo "X Creating execution... Task $n-task0 failed with exit code: \${!x} and message: The container exited with an error." >&2; fi
    echo "Executing job failed" >&2
    echo "ERROR: (gcloud.run.jobs.execute) The execution failed." >&2
    echo "View details about this execution by running:" >&2
    echo "gcloud run jobs executions describe $n" >&2
    exit "$rc";;
  *"executions tasks list"*)
    n="$(grep -oE 'iron-log-parity-[a-z0-9]{5}' <<< "$*" | head -1)"
    v="STUB_EXIT_$(env_of "$n")"
    if [ -n "\${!v:-}" ]; then echo "[{\\"status\\":{\\"lastAttemptResult\\":{\\"exitCode\\":\${!v}}}}]"; else echo "[{}]"; fi;;
  *"services describe"*)
    svc="$(grep -oE 'iron-log(-[a-z]+)?' <<< "$*" | head -1)"; up="$(echo "$svc" | tr a-z- A-Z_)"
    v="STUB_NOSVC_$up"; [ -n "\${!v:-}" ] && { echo "ERROR: (gcloud.run.services.describe) PERMISSION_DENIED" >&2; exit 1; }
    echo "{\\"status\\":{\\"traffic\\":[{\\"revisionName\\":\\"$svc-00002\\",\\"percent\\":100},{\\"revisionName\\":\\"$svc-00003\\",\\"percent\\":0}]}}";;
  *"revisions describe"*)
    rev="$(grep -oE 'iron-log(-[a-z]+)?-0000[0-9]' <<< "$*" | head -1)"; svc="\${rev%-0000*}"; up="$(echo "$svc" | tr a-z- A-Z_)"
    v="STUB_SHA_$up"; case "$rev" in *-00003) v=STUB_NO_SUCH_VAR;; esac; echo "{\\"spec\\":{\\"containers\\":[{\\"env\\":[{\\"name\\":\\"NODE_ENV\\",\\"value\\":\\"production\\"},{\\"name\\":\\"COMMIT_SHA\\",\\"value\\":\\"\${!v:-}\\"}]}]}}";;
  *"executions list"*) echo "iron-log-parity-SOMEONE-ELSES-RUN";;   # must never be used: another run could be the newest
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
    expect(r.args).toEqual(['production,20261001000001,20261002000001', 'staging,20261001000001,20261002000001', 'qa,20261001000001,20261002000001', 'secrets,20261001000001,20261002000001']);
    expect(r.summary).toContain('| production | OK |');
    expect(r.summary).toContain('| staging | OK |');
    expect(r.summary).toContain('| qa | OK |');
    expect(r.summary).toContain('| secrets | OK |');
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
  it('does not let a job that could not start inherit an older execution\'s result (UNKNOWN, never OK)', async () => {
    // qa cannot start (no execution name printed); another run's execution exists and its task exited 0.
    const r = await go({ STUB_NOSTART_QA: '1', STUB_EXIT_STAGING: '0' });
    expect(r.status).toBe(1);
    expect(r.summary).toContain('| qa | UNKNOWN |');
  });
  it('takes the execution from the execute call, never from the newest execution (another run may be the newest)', async () => {
    const r = await go({ STUB_RC_QA: '1', STUB_EXIT_QA: '4' });
    expect(r.status).toBe(1);
    expect(r.summary).toContain('| qa | AHEAD OF MAIN |');
    expect(r.summary).toContain('executions/details/us-central1/iron-log-parity-qaxxx?');
    expect(r.summary).not.toContain('SOMEONE-ELSES-RUN');
  });
  it('reads the exit code from the error text real gcloud prints on failure, where --format prints no name', async () => {
    const r = await go({ STUB_RC_STAGING: '1', STUB_EXIT_STAGING: '3' });
    expect(r.summary).toContain('| staging | BEHIND |');
    expect(r.summary).toContain('executions/details/us-central1/iron-log-parity-stagi?'); // the name comes from the "executions describe" line
  });
  it('falls back to the task list when the error text has no exit code', async () => {
    const r = await go({ STUB_RC_QA: '1', STUB_EXIT_QA: '4', STUB_NOTEXT_QA: '1' });
    expect(r.status).toBe(1);
    expect(r.summary).toContain('| qa | AHEAD OF MAIN |');
  });
  it('never reads exit code 0 from a failed run as OK', async () => {
    const r = await go({ STUB_RC_PRODUCTION: '1', STUB_EXIT_PRODUCTION: '0' });
    expect(r.status).toBe(1);
    expect(r.summary).toContain('| production | UNKNOWN |');
  });
  it('shows the secrets check: UNLISTED (3) is a warning, MISSING (4) fails, anything else is UNKNOWN', async () => {
    const unlisted = await go({ STUB_RC_SECRETS: '1', STUB_EXIT_SECRETS: '3' });
    expect(unlisted.status).toBe(0);
    expect(unlisted.summary).toContain('| secrets | UNLISTED |');
    expect(unlisted.out).toContain('::warning title=secrets: UNLISTED');
    const missing = await go({ STUB_RC_SECRETS: '1', STUB_EXIT_SECRETS: '4' });
    expect(missing.status).toBe(1);
    expect(missing.summary).toContain('| secrets | MISSING |');
    expect(missing.out).toContain('::error title=secrets: MISSING');
    const unknown = await go({ STUB_RC_SECRETS: '1' });
    expect(unknown.status).toBe(1);
    expect(unknown.summary).toContain('| secrets | UNKNOWN |');
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

  describe('the running commit table', () => {
    const git = (...a) => new Promise(done => execFile('git', a, { encoding: 'utf8' }, (_e, out) => done(out.trim())));
    it('says each service is on main\'s tip, behind it, or not on main, and never turns the run red or yellow', async () => {
      const tip = await git('rev-parse', 'HEAD'); const older = await git('rev-parse', 'HEAD~2'); const other = '0'.repeat(40);
      const behind = await git('rev-list', '--count', `${older}..${tip}`);
      const r = await go({ STUB_SHA_IRON_LOG: tip, STUB_SHA_IRON_LOG_STAGING: older, STUB_SHA_IRON_LOG_QA: other });
      expect(r.status).toBe(0);
      expect(r.summary).toContain(`### Running commit (main's tip is \`${tip.slice(0, 7)}\`)`);
      expect(r.summary).toContain(`| production | iron-log | \`${tip.slice(0, 7)}\` | main's tip |`);
      expect(r.summary).toContain(`| staging | iron-log-staging | \`${older.slice(0, 7)}\` | ${behind} commit(s) behind main |`);
      expect(r.summary).toContain('| qa | iron-log-qa | `0000000` | this checkout does not have that commit |');
      expect(r.out).not.toContain('::warning');
      expect(r.out).not.toContain('::error');
    });
    it('says unknown, with a notice and no failure, when a service cannot be read or has no commit', async () => {
      const r = await go({ STUB_NOSVC_IRON_LOG: '1', STUB_SHA_IRON_LOG_STAGING: '' });
      expect(r.status).toBe(0);
      expect(r.summary).toContain('| production | iron-log | `unknown` | could not read it');
      expect(r.summary).toContain('| staging | iron-log-staging | `unknown` | could not read it');
      expect(r.out).toContain('::notice title=production: running commit unknown');
    });
    it('reads the revision that has the traffic, not the latest one', async () => {
      const tip = await git('rev-parse', 'HEAD');
      const r = await go({ STUB_SHA_IRON_LOG: tip });
      // The stub gives revision -00003 (0% traffic, the latest) no COMMIT_SHA: reading it would say unknown.
      expect(r.summary).toContain(`| production | iron-log | \`${tip.slice(0, 7)}\` | main's tip |`);
    });
  });
});
