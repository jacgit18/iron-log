import { execFile } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// scripts/qa-seed-secrets.mjs reads QA's URL and key from Secret Manager and passes them to qa-seed.mjs. These tests put a stub `gcloud` first on the PATH, so no real secret is read and no database is
// reached (an unknown persona is refused by qa-seed.mjs before it connects). They check what the script must never do: print a secret, put one on a command line, fetch the key on a dry run, run the seed after a failed read.
const PASSWORD = 'not-a-real-password-9f3a';
function stub(failing = false, urlValue = `postgres://qa_owner:${PASSWORD}@qa.example.invalid/db`) {
  const dir = mkdtempSync(join(tmpdir(), 'gcloud-stub-'));
  const log = join(dir, 'calls.log');
  const body = failing
    ? `#!/bin/sh\necho "$@" >> "${log}"\necho "ERROR: permission denied" >&2\nexit 1\n`
    : `#!/bin/sh\necho "$@" >> "${log}"\ncase "$*" in\n  *iron-log-qa-owner-database-url*) echo "${urlValue}";;\n  *iron-log-qa-pii-key*) echo "stub-key";;\nesac\n`;
  writeFileSync(join(dir, 'gcloud'), body);
  chmodSync(join(dir, 'gcloud'), 0o755);
  return { dir, calls: () => { try { return readFileSync(log, 'utf8').trim().split('\n'); } catch { return []; } } };
}
const run = (args: string[], dir: string, cwd?: string) =>
  new Promise<{ status: number; out: string }>(done =>
    execFile('node', [resolve('scripts/qa-seed-secrets.mjs'), ...args], { ...(cwd ? { cwd } : {}), env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, QA_PII_ENCRYPTION_KEY: '', QA_DATABASE_URL: '' }, encoding: 'utf8', timeout: 90_000 },
      (err, stdout, stderr) => done({ status: err ? Number((err as { code?: number }).code ?? 1) : 0, out: `${stdout}\n${stderr}` })));

describe('qa-seed-secrets', () => {
  it('reads only the URL on a dry run, pins the project, passes the host on and prints no secret', async () => {
    const g = stub();
    const r = await run(['--persona', 'nope'], g.dir);
    expect(r.out).toContain('Unknown persona "nope"'); // qa-seed.mjs got the URL and the host and refused the persona
    expect(r.out).toContain('QA seed on qa.example.invalid (secrets from project iron-log-jacgit18): dry run');
    expect(r.out).not.toContain(PASSWORD);
    expect(g.calls()).toHaveLength(1);
    expect(g.calls()[0]).toContain('--secret=iron-log-qa-owner-database-url');
    expect(g.calls()[0]).toContain('--project=iron-log-jacgit18');
  }, 100_000);

  it('reads the key too with --apply, and still prints neither', async () => {
    const g = stub();
    const r = await run(['--persona', 'nope', '--apply'], g.dir);
    expect(g.calls().map(c => /--secret=(\S+)/.exec(c)?.[1])).toEqual(['iron-log-qa-owner-database-url', 'iron-log-qa-pii-key']);
    expect(r.out).toContain('writing (--apply)');
    expect(r.out).not.toContain(PASSWORD);
    expect(r.out).not.toContain('stub-key');
  }, 100_000);

  it('stops when a secret cannot be read, names it, and never runs the seed', async () => {
    const g = stub(true);
    const r = await run(['--persona', 'nope'], g.dir);
    expect(r.status).toBe(1);
    expect(r.out).toContain('Could not read the secret iron-log-qa-owner-database-url');
    expect(r.out).not.toContain('Unknown persona'); // the seed never started
  }, 100_000);

  it('refuses --host: the host comes from the secret', async () => {
    const g = stub();
    const r = await run(['--host', 'elsewhere.example.invalid'], g.dir);
    expect(r.status).toBe(1);
    expect(r.out).toContain('Do not pass --host');
    expect(g.calls()).toHaveLength(0);
  }, 100_000);

  it('works from any folder, not only the repository root', async () => {
    const g = stub();
    const r = await run(['--persona', 'nope'], g.dir, tmpdir());
    expect(r.out).toContain('Unknown persona "nope"');
  }, 100_000);

  it('shows gcloud\'s own reason when a read fails, and refuses a secret that is not a database URL', async () => {
    const bad = await run(['--persona', 'nope'], stub(true).dir);
    expect(bad.out).toContain('gcloud said: ERROR: permission denied');
    const notUrl = await run(['--persona', 'nope'], stub(false, 'just some text').dir);
    expect(notUrl.status).toBe(1);
    expect(notUrl.out).toContain('is not a database URL');
    expect(notUrl.out).not.toContain('Unknown persona');
    const web = await run(['--persona', 'nope'], stub(false, 'https://example.invalid/x').dir);
    expect(web.out).toContain('is not a database URL');
  }, 200_000);

  it('refuses --host=value as well', async () => {
    const r = await run(['--host=elsewhere.example.invalid'], stub().dir);
    expect(r.status).toBe(1);
    expect(r.out).toContain('Do not pass --host');
  }, 100_000);
});
