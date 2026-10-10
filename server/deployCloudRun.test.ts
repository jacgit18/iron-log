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
  *"run services describe"*"--format=json"*) echo '{"status":{"traffic":[{"revisionName":"iron-log-00001-aaa","percent":100},{"tag":"candidate","url":"https://candidate---iron-log-x.run.app","revisionName":"iron-log-00002-bbb"}]}}';;
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
