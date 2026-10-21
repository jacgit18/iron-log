import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs without types
import { canonicalHost, notLocalProblem, sameServer } from '../scripts/lib/db-script.mjs';

// Audit 2026-10-21: S-7 (the production refusal compares more than spelling) and C-2 (the local-only scripts read the host the way pg does).
const run = (script: string, env: Record<string, string>) =>
  new Promise<{ status: number; stderr: string }>(done =>
    execFile('node', [resolve(script)], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 20_000 }, (err, _out, stderr) => done({ status: err ? Number((err as { code?: number }).code ?? 1) : 0, stderr })));

describe('notLocalProblem (C-2)', () => {
  it('accepts a plain local URL', () => {
    for (const u of ['postgres://u:p@127.0.0.1:5433/ironlog', 'postgres://u:p@localhost/ironlog', 'postgres://u:p@[::1]:5433/ironlog']) expect(notLocalProblem(u)).toBeNull();
  });
  it('refuses a remote host, and a local one with a host or hostaddr override', () => {
    expect(notLocalProblem('postgres://u:p@db.prod.example/x')).toMatch(/not this machine/);
    expect(notLocalProblem('postgres://u:p@localhost/x?host=db.prod.example')).toMatch(/host=/);
    expect(notLocalProblem('postgres://u:p@localhost/x?hostaddr=203.0.113.9')).toMatch(/hostaddr=/);
    expect(notLocalProblem('postgres://u:p@LOCALHOST/x?host=db.prod.example')).toMatch(/host=/);
    expect(notLocalProblem('not a url')).toMatch(/valid URL/);
  });
  it.each(['scripts/check-migrations.mjs', 'scripts/e2e-sync.mjs'])('%s exits 2 before doing anything for a ?host= URL', async script => {
    const out = await run(script, { DATABASE_URL: 'postgres://u:p@localhost/x?host=db.prod.example' });
    expect(out.status).toBe(2);
    expect(out.stderr).toContain('Refusing');
  });
});

describe('sameServer (S-7)', () => {
  const cname = (map: Record<string, string>) => async (h: string) => { if (!map[h]) throw new Error('ENODATA'); return [map[h]]; };
  const noAddrs = { addrs: async () => [] as string[] };
  it('treats the pooled address, a CNAME alias and a chain of aliases as the same server', async () => {
    const c = cname({ 'db.alias.example': 'ep-prod-1.example.com', 'a.example': 'db.alias.example.' });
    expect(await sameServer('ep-prod-1-pooler.example.com', 'ep-prod-1.example.com', { cname: c, ...noAddrs })).toBe(true);
    expect(await sameServer('ep-prod-1.example.com', 'db.alias.example', { cname: c, ...noAddrs })).toBe(true);
    expect(await sameServer('ep-prod-1.example.com', 'a.example', { cname: c, ...noAddrs })).toBe(true);
    expect(await canonicalHost('a.example', c)).toBe('ep-prod-1.example.com');
  });
  it('compares addresses when one side is an IP, and keeps different names with shared addresses apart', async () => {
    expect(await sameServer('203.0.113.9', 'ep-prod-1.example.com', { cname: cname({}), addrs: async () => ['203.0.113.9'] })).toBe(true);
    expect(await sameServer('ep-qa.example.com', 'ep-prod-1.example.com', { cname: cname({}), addrs: async () => ['203.0.113.9'] })).toBe(false);
  });
});
