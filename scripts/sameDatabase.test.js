import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// scripts/same-database.mjs: the owner URL must name the same server as the read-only production URL before the migrate job migrates with it.
const run = env => new Promise(done => execFile('node', [resolve('scripts/same-database.mjs')], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' }, (err, stdout, stderr) => done({ status: err ? Number(err.code ?? 1) : 0, out: stdout + stderr })));
const reader = 'postgres://migrations_reader:rpw@ep-flat-bonus-b4gha6jz.c-6.us-east-2.aws.neon.tech/neondb';

describe('same-database.mjs', () => {
  it('passes when the owner URL is the same server (direct or pooled spelling), and prints no URL', async () => {
    const same = await run({ OWNER_URL: 'postgres://neondb_owner:secret-pw@ep-flat-bonus-b4gha6jz.c-6.us-east-2.aws.neon.tech/neondb', READER_URL: reader });
    expect(same.status).toBe(0);
    expect(same.out).not.toContain('secret-pw');
    const pooled = await run({ OWNER_URL: 'postgres://neondb_owner:secret-pw@ep-flat-bonus-b4gha6jz-pooler.c-6.us-east-2.aws.neon.tech/neondb', READER_URL: reader });
    expect(pooled.status).toBe(0);
  });
  it('refuses a different server (staging, QA, a typo) before anything runs, without printing the URLs', async () => {
    const r = await run({ OWNER_URL: 'postgres://neondb_owner:secret-pw@ep-sweet-mouse-b4qg17sh.c-6.us-east-2.aws.neon.tech/neondb', READER_URL: reader });
    expect(r.status).toBe(1);
    expect(r.out).toContain('different database server');
    expect(r.out).not.toContain('secret-pw');
    expect(r.out).not.toContain('rpw');
  });
  it('refuses when either URL is missing', async () => {
    expect((await run({ READER_URL: reader })).status).toBe(1);
    expect((await run({ OWNER_URL: 'postgres://o:p@h.example/db' })).status).toBe(1);
    expect((await run({})).out).toContain('OWNER_URL (the production owner login) is not set');
  });
});
