import { execFile } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script
import { checkTarget, plan, QA_MARK } from './qa-catalog-secrets.mjs';

// scripts/qa-catalog-secrets.mjs reads QA's URL from Secret Manager, checks it, and runs an import script with it. Pure parts are called directly; the
// whole script is run with a stub `gcloud` first on the PATH, so no real secret is read and no database is reached.
const PASSWORD = 'not-a-real-password-9f3a';
const URL_OK = `postgres://qa_owner:${PASSWORD}@qa.example.invalid/db`;

describe('plan', () => {
  it('catalog is catalog-import --source dsld, a dry run unless --apply, extra flags passed on', () => {
    expect(plan('catalog', [])).toEqual({ file: 'scripts/catalog-import.mjs', args: ['--source', 'dsld'] });
    expect(plan('catalog', ['--apply', '--allow-mass-retire']).args).toEqual(['--source', 'dsld', '--allow-mass-retire', '--apply']);
    expect(() => plan('catalog', ['--source', 'fedb'])).toThrow('Do not pass --source');
  });
  it('upcs uses production\'s scope and the main checkout\'s cache', () => {
    const dry = plan('upcs', [], { cacheDir: '/main/.cache' });
    expect(dry.file).toBe('scripts/supplement-upc-import.mjs');
    expect(dry.args).toEqual(['--only-brands', '--brand', 'thorne', '--brand', 'sports research', '--brand', 'now', '--brand', 'nature made', '--cache', '/main/.cache/dsld-upcs.tsv']);
    expect(plan('upcs', ['--apply', '--limit', '5'], { cacheDir: '/main/.cache' }).args.slice(-3)).toEqual(['--limit', '5', '--apply']);
    expect(plan('upcs', ['--cache', 'x.tsv'], { cacheDir: '/main/.cache' }).args.filter((a: string) => a === '--cache')).toHaveLength(1);
    expect(plan('upcs', []).args).not.toContain('--cache');
  });
  it('refuses an unknown subcommand and says catalog comes first', () => {
    expect(() => plan('nope', [])).toThrow(/catalog.*FIRST/s);
  });
});

describe('checkTarget', () => {
  const client = (mark: string | null) => ({ end: async () => {}, mark });
  const deps = (mark: string | null, guard = async () => {}) => ({ guard, open: async () => client(mark), mark: async (c: { mark: string | null }) => c.mark });
  it('accepts a QA-marked database and returns its host', async () => {
    expect(await checkTarget(URL_OK, deps(QA_MARK))).toBe('qa.example.invalid');
  });
  it('refuses a database without the QA mark, naming no secret', async () => {
    for (const mark of [null, 'iron-log staging']) {
      const err = await checkTarget(URL_OK, deps(mark)).catch((e: Error) => e);
      expect(String(err)).toContain('does not carry the QA mark');
      expect(String(err)).not.toContain(PASSWORD);
    }
  });
  it('refuses production before connecting', async () => {
    let connected = false;
    const guard = async () => { throw new Error('is production'); };
    await expect(checkTarget(URL_OK, { guard, open: async () => { connected = true; return client(QA_MARK); }, mark: async () => QA_MARK })).rejects.toThrow('is production');
    expect(connected).toBe(false);
  });
  it('refuses a value that is not a database URL', async () => {
    await expect(checkTarget('just text', deps(QA_MARK))).rejects.toThrow('is not a database URL');
    await expect(checkTarget('https://example.invalid/x', deps(QA_MARK))).rejects.toThrow('is not a database URL');
  });
});

function stub(urlValue = URL_OK, failing = false) {
  const dir = mkdtempSync(join(tmpdir(), 'gcloud-stub-'));
  const log = join(dir, 'calls.log');
  const body = failing
    ? `#!/bin/sh\necho "$@" >> "${log}"\necho "ERROR: permission denied" >&2\nexit 1\n`
    : `#!/bin/sh\necho "$@" >> "${log}"\necho "${urlValue}"\n`;
  writeFileSync(join(dir, 'gcloud'), body);
  chmodSync(join(dir, 'gcloud'), 0o755);
  return { dir, calls: () => { try { return readFileSync(log, 'utf8').trim().split('\n'); } catch { return []; } } };
}
const run = (args: string[], dir: string, env: Record<string, string> = {}) =>
  new Promise<{ status: number; out: string }>(done =>
    execFile('node', [resolve('scripts/qa-catalog-secrets.mjs'), ...args], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, DATABASE_URL: '', ...env }, encoding: 'utf8', timeout: 60_000 },
      (err, stdout, stderr) => done({ status: err ? Number((err as { code?: number }).code ?? 1) : 0, out: `${stdout}\n${stderr}` })));

describe('qa-catalog-secrets (whole script)', () => {
  it('refuses production\'s host, pins the project, reads only the URL and prints no secret', async () => {
    const g = stub();
    const r = await run(['catalog'], g.dir, { PROD_DATABASE_URL: URL_OK });
    expect(r.status).toBe(2);
    expect(r.out).toContain("is production's database");
    expect(r.out).not.toContain(PASSWORD);
    expect(g.calls()).toHaveLength(1);
    expect(g.calls()[0]).toContain('--secret=iron-log-qa-owner-database-url');
    expect(g.calls()[0]).toContain('--project=iron-log-jacgit18');
  }, 90_000);
  it('stops when the secret cannot be read, and on a bad subcommand before reading anything', async () => {
    const bad = await run(['upcs'], stub(URL_OK, true).dir);
    expect(bad.status).toBe(1);
    expect(bad.out).toContain('Could not read the secret iron-log-qa-owner-database-url');
    const g = stub();
    const none = await run(['wrong'], g.dir);
    expect(none.status).toBe(1);
    expect(none.out).toContain('Run this FIRST');
    expect(g.calls()).toHaveLength(0);
  }, 90_000);
  it('refuses a secret that is not a database URL', async () => {
    const r = await run(['catalog'], stub('just some text').dir, { PROD_DATABASE_URL: 'postgres://u:p@other.example.invalid/db' });
    expect(r.out).toContain('is not a database URL');
  }, 90_000);
});
