import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// scripts/deploy-cloud-run.sh with a stand-in `gcloud` that records what it was asked to do, so the traffic handling (ADR 017) is checked
// without touching Google: a candidate gets no traffic, promote moves it, and a plain deploy undoes any rollback pin.
const SCRIPT = resolve('scripts/deploy-cloud-run.sh');

describe('deploy-cloud-run.sh traffic commands', () => {
  let dir: string;
  let calls: string;
  const gcloudStub = `#!/usr/bin/env bash
echo "$*" >> "${'$'}CALLS_FILE"
case "$*" in
  *"projects describe"*) echo 123456;;
  # What the account may do is set by the test: SECRETS_READABLE=1 is your machine (it can see a secret exists), unset is the CI deployer.
  *"secrets describe"*) [ "$SECRETS_READABLE" = 1 ] && exit 0; exit 1;;
  # LIVE_RESEND=1: the live service already maps RESEND_API_KEY from a secret.
  *"run services describe"*"--format=json"*)
    env='[]'
    [ "$LIVE_RESEND" = 1 ] && env='[{"name":"RESEND_API_KEY","valueFrom":{"secretKeyRef":{"name":"iron-log-resend-api-key","key":"latest"}}}]'
    echo '{"spec":{"template":{"spec":{"containers":[{"env":'"$env"'}]}}},"status":{"traffic":[{"revisionName":"iron-log-00001-aaa","percent":100},{"tag":"candidate","url":"https://candidate---iron-log-x.run.app","revisionName":"iron-log-00002-bbb"}]}}';;
esac
exit 0
`;
  const run = (args: string[], env: Record<string, string> = {}) =>
    new Promise<{ status: number; stdout: string; stderr: string }>(done => {
      execFile('bash', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, PROJECT_ID: 'p', CALLS_FILE: calls, BUILD_SA: 'b@p.iam.gserviceaccount.com', ...env } }, (err, stdout, stderr) =>
        done({ status: err ? Number((err as { code?: number }).code ?? 1) : 0, stdout, stderr }));
    });
  const recorded = () => readFileSync(calls, 'utf8').trim().split('\n');

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'deploy-run-'));
    calls = join(dir, 'calls.log');
    writeFileSync(join(dir, 'gcloud'), gcloudStub);
    chmodSync(join(dir, 'gcloud'), 0o755);
    writeFileSync(join(dir, '.gitignore'), 'gcloud\ncalls.log\n');
    const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'x');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('candidate deploys with no traffic and a tag, and prints the tagged address', async () => {
    writeFileSync(calls, '');
    const out = await run(['candidate']);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('CANDIDATE_URL=https://candidate---iron-log-x.run.app');
    const deploy = recorded().find(l => l.includes('run deploy'))!;
    expect(deploy).toContain('--no-traffic');
    expect(deploy).toContain('--tag candidate');
    expect(deploy).toMatch(/COMMIT_SHA=[0-9a-f]{7,}/);
    expect(recorded().some(l => l.includes('update-traffic'))).toBe(false);
  });

  it('promote moves all traffic to the tag, then removes the tag', async () => {
    writeFileSync(calls, '');
    expect((await run(['promote'])).status).toBe(0);
    const traffic = recorded().filter(l => l.includes('update-traffic'));
    expect(traffic[0]).toContain('--to-tags candidate=100');
    expect(traffic[1]).toContain('--remove-tags candidate');
  });

  it('a plain deploy ends by pointing traffic at the latest revision, so a rollback pin cannot strand it', async () => {
    writeFileSync(calls, '');
    expect((await run(['deploy'])).status).toBe(0);
    const lines = recorded();
    expect(lines.find(l => l.includes('run deploy'))).not.toContain('--no-traffic');
    expect(lines[lines.length - 1]).toContain('update-traffic');
    expect(lines[lines.length - 1]).toContain('--to-latest');
  });

  // --set-secrets replaces the service's whole secret list, so RESEND_API_KEY has to be in it on every deploy that should keep the email code.
  describe('the Resend key for the emailed sign-in code (ADR 042)', () => {
    const FOUR = ['APP_DATABASE_URL=iron-log-app-database-url:latest', 'BETTER_AUTH_SECRET=iron-log-auth-secret:latest', 'GOOGLE_CLIENT_ID=iron-log-google-client-id:latest', 'GOOGLE_CLIENT_SECRET=iron-log-google-client-secret:latest'];
    const RESEND = 'RESEND_API_KEY=iron-log-resend-api-key:latest';
    const secretsOf = (cmd: string) => /--set-secrets (\S+)/.exec(recorded().find(l => l.includes(cmd))!)![1]!.split(',');

    it('is passed, with the other four, when the secret exists in Secret Manager (your machine)', async () => {
      writeFileSync(calls, '');
      expect((await run(['deploy'], { SECRETS_READABLE: '1' })).status).toBe(0);
      expect(secretsOf('run deploy')).toEqual([...FOUR, RESEND]);
    });

    it('is kept by a deploy that cannot read secrets (CI) when the live service already has it', async () => {
      writeFileSync(calls, '');
      const out = await run(['candidate'], { LIVE_RESEND: '1' });
      expect(out.status).toBe(0);
      expect(secretsOf('run deploy')).toEqual([...FOUR, RESEND]);
      expect(out.stdout).toContain('RESEND_API_KEY is passed');
    });

    it('is left out, and the feature stays off, when the secret does not exist and the service does not have it', async () => {
      writeFileSync(calls, '');
      const out = await run(['deploy']);
      expect(out.status).toBe(0);
      expect(secretsOf('run deploy')).toEqual(FOUR);
      expect(out.stdout).toContain('stays off');
    });

    it('RESEND_OFF=1 leaves it out even when the secret exists and the live service has it, so the feature can be switched off', async () => {
      writeFileSync(calls, '');
      const out = await run(['candidate'], { SECRETS_READABLE: '1', LIVE_RESEND: '1', RESEND_OFF: '1' });
      expect(out.status).toBe(0);
      expect(secretsOf('run deploy')).toEqual(FOUR);
      expect(out.stdout).toContain('RESEND_OFF=1');
    });

    it('the secrets command stores it and lets the runtime account read it, and the value is never a gcloud argument', async () => {
      writeFileSync(calls, '');
      const env = { APP_DATABASE_URL: 'postgres://ironlog_app:pw@db.example.com/x', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'gs' };
      const out = await run(['secrets'], { ...env, RESEND_API_KEY: 're_secretvalue123' });
      expect(out.status).toBe(0);
      const lines = recorded();
      expect(lines.some(l => l.includes('secrets create iron-log-resend-api-key'))).toBe(true);
      expect(lines.some(l => l.includes('secrets versions add iron-log-resend-api-key'))).toBe(true);
      expect(lines.some(l => l.includes('add-iam-policy-binding iron-log-resend-api-key') && l.includes('iron-log-run@p.iam.gserviceaccount.com'))).toBe(true);
      expect(lines.join('\n') + out.stdout + out.stderr).not.toContain('re_secretvalue123');
    });

    it('the secrets command leaves it alone, and says so, when RESEND_API_KEY is not exported', async () => {
      writeFileSync(calls, '');
      const out = await run(['secrets'], { APP_DATABASE_URL: 'postgres://ironlog_app:pw@db.example.com/x', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'gs', RESEND_API_KEY: '' });
      expect(out.status).toBe(0);
      expect(recorded().some(l => l.includes('iron-log-resend-api-key'))).toBe(false);
      expect(out.stdout).toContain('not touched');
    });
  });

  it('discard and restore make the single call each is named for', async () => {
    writeFileSync(calls, '');
    await run(['discard']);
    await run(['restore']);
    const traffic = recorded().filter(l => l.includes('update-traffic'));
    expect(traffic[0]).toContain('--remove-tags candidate');
    expect(traffic[1]).toContain('--to-latest');
  });

  it('refuses to build from a dirty working tree', async () => {
    writeFileSync(join(dir, 'dirty.txt'), 'x');
    const out = await run(['candidate']);
    expect(out.status).not.toBe(0);
    expect(out.stderr).toContain('uncommitted changes');
    rmSync(join(dir, 'dirty.txt'));
  });
});
