import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// scripts/qa-seed.mjs must refuse before touching anything: no URL, the wrong host, no key for --apply, and (checked by hand against a scratch
// database, because it needs one) an unmarked database. These cases never reach a database.
const run = (args: string[], env: Record<string, string>) =>
  new Promise<{ status: number; stderr: string }>(done =>
    execFile('npx', ['tsx', resolve('scripts/qa-seed.mjs'), ...args], { env: { ...process.env, PROD_URL_LOOKUP: 'off', ...env }, encoding: 'utf8', timeout: 60_000 },
      (err, _out, stderr) => done({ status: err ? Number((err as { code?: number }).code ?? 1) : 0, stderr })));

const URL_ = 'postgres://u:p@qa.example.invalid/db';

describe('qa-seed refusals', () => {
  it('needs the QA URL', async () => {
    const out = await run(['--host', 'qa.example.invalid'], { QA_DATABASE_URL: '' });
    expect(out.status).toBe(2);
    expect(out.stderr).toContain('No QA_DATABASE_URL');
  });
  it('needs --host, typed on purpose', async () => {
    const out = await run([], { QA_DATABASE_URL: URL_ });
    expect(out.status).toBe(2);
    expect(out.stderr).toContain('Usage');
  });
  it('refuses an unknown persona', async () => {
    const out = await run(['--host', 'qa.example.invalid', '--persona', 'nobody'], { QA_DATABASE_URL: URL_ });
    expect(out.status).toBe(2);
    expect(out.stderr).toContain('Unknown persona');
  });
  it('refuses --apply without QA\'s own key', async () => {
    const out = await run(['--host', 'qa.example.invalid', '--apply'], { QA_DATABASE_URL: URL_, QA_PII_ENCRYPTION_KEY: '' });
    expect(out.status).toBe(2);
    expect(out.stderr).toContain('QA_PII_ENCRYPTION_KEY');
  });
  it('refuses a host that is not the one in the URL', async () => {
    const out = await run(['--host', 'other.example.invalid'], { QA_DATABASE_URL: URL_ });
    expect(out.status).toBe(2);
    expect(out.stderr).toContain('does not match');
  });
});
