import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// `backup-cloud-run.sh check` with a stub gcloud that prints a canned `storage ls -l` listing. It must read names and times only.
const run = (listing, env = {}, cmd = 'check') => {
  const dir = mkdtempSync(join(tmpdir(), 'bk-'));
  writeFileSync(join(dir, 'gcloud'), `#!/usr/bin/env bash\ncat <<'EOF'\n${listing}\nEOF\n`);
  chmodSync(join(dir, 'gcloud'), 0o755);
  return spawnSync('bash', ['scripts/backup-cloud-run.sh', cmd], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, PROJECT_ID: 'p', ...env } });
};
const hoursAgo = h => new Date(Date.now() - h * 3600_000).toISOString().replace(/\.\d+Z$/, 'Z');
const line = (h, name) => `   123456  ${hoursAgo(h)}  gs://p-iron-log-backups/${name}`;

describe('backup-cloud-run.sh check', () => {
  it('is OK for a dump from last night', () => {
    const r = run(`${line(8, 'ironlog-2026-11-02.dump')}\n${line(8, 'ironlog-2026-11-02.manifest')}\nTOTAL: 2 objects`);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/BACKUP OK: the newest dump is 8h old/);
  });
  it('uses the newest dump, not the oldest', () => {
    const r = run(`${line(80, 'ironlog-2026-10-30.dump')}\n${line(5, 'ironlog-2026-11-02.dump')}`);
    expect(r.status).toBe(0);
  });
  it('fails when the newest dump is over 26 hours old, naming the age', () => {
    const r = run(line(50, 'ironlog-2026-10-31.dump'));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/BACKUP OLD: the newest dump is 50h old \(limit 26h\)/);
  });
  it('honours MAX_AGE_HOURS', () => {
    expect(run(line(50, 'ironlog-x.dump'), { MAX_AGE_HOURS: '72' }).status).toBe(0);
  });
  it('fails when there is no dump', () => {
    const r = run('TOTAL: 0 objects');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/BACKUP MISSING/);
  });
  it('list still exits 0 when the newest dump is old, and prints the warning', () => {
    const r = run(line(50, 'ironlog-2026-10-31.dump'), {}, 'list');
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/BACKUP OLD/);
  });
});
