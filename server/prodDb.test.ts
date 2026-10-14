import { execFile } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// scripts/prod-db.sh: the production database chores. dbmate, the backup and the importer are stubs that log what they were asked to
// do, so these tests never reach a database.
const SCRIPT = resolve('scripts/prod-db.sh');
const URL = 'postgresql://owner:s3cret@ep-prod.neon.tech/neondb?sslmode=require';
let dir: string;
let log: string;

const stub = (name: string, body: string) => {
  const path = join(dir, name);
  writeFileSync(path, `#!/usr/bin/env bash\necho "${name} $* url=\${DATABASE_URL:-}" >> "${log}"\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
};

const run = (args: string[], env: Record<string, string> = {}) =>
  new Promise<{ status: number; out: string; calls: string[] }>(done => {
    execFile('bash', [SCRIPT, ...args], {
      // DATABASE_URL from the caller's shell (a local one for the db checks) must not leak in: the stubs log what each step was given.
      env: {
        ...process.env, DATABASE_URL: '', PROD_DATABASE_URL: URL,
        DBMATE: join(dir, 'dbmate'), BACKUP: join(dir, 'backup'), CATALOG_IMPORT: join(dir, 'catalog'), ...env,
      },
      encoding: 'utf8',
    }, (err, stdout, stderr) => {
      const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
      done({ status: err ? Number((err as { code?: number }).code ?? 1) : 0, out: stdout + stderr, calls });
    });
  });

// dbmate's status output, with the given files still waiting.
const dbmateWith = (waiting: string[]) => stub('dbmate', `
if [ "$1" = status ]; then
  echo "[X] 20261007000001_core_tables.sql"
  ${waiting.map(f => `echo "[ ] ${f}"`).join('\n  ')}
  echo; echo "Applied: 1"; echo "Pending: ${waiting.length}"
fi`);

beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'prod-db-')); log = join(dir, 'calls.log'); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  writeFileSync(log, '');
  stub('backup', '');
  stub('catalog', '');
  dbmateWith([]);
});

describe('prod-db.sh', () => {
  it('status shows where production is without the password, and passes the URL only to dbmate', async () => {
    const r = await run(['status']);
    expect(r.status).toBe(0);
    expect(r.out).toContain('database: ep-prod.neon.tech/neondb');
    expect(r.out).not.toContain('s3cret');
    expect(r.calls).toEqual([`dbmate status url=${URL}`]);
  });

  it('pending exits 0 with none waiting and 3 listing them otherwise', async () => {
    expect(await run(['pending'])).toMatchObject({ status: 0 });
    dbmateWith(['20261011000001_catalog_items.sql']);
    const r = await run(['pending']);
    expect(r.status).toBe(3);
    expect(r.out.trim()).toBe('20261011000001_catalog_items.sql');
  });

  it('migrate is a dry run without --apply: it lists, and writes nothing', async () => {
    dbmateWith(['20261010000002_a.sql', '20261011000001_b.sql']);
    const r = await run(['migrate']);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/Waiting:\n {2}20261010000002_a\.sql\n {2}20261011000001_b\.sql\nDry run/);
    expect(r.calls.some(c => c.startsWith('backup') || c.startsWith('dbmate up'))).toBe(false);
  });

  it('migrate --apply backs up first, then applies, then shows the status', async () => {
    dbmateWith(['20261011000001_b.sql']);
    const r = await run(['migrate', '--apply']);
    expect(r.status).toBe(0);
    expect(r.calls.map(c => c.split(' url=')[0])).toEqual(['dbmate status', 'backup run', 'dbmate up', 'dbmate status']);
  });

  it('migrate --apply with nothing waiting takes no backup and changes nothing', async () => {
    const r = await run(['migrate', '--apply']);
    expect(r.out).toContain('Nothing to do');
    expect(r.calls).toEqual([`dbmate status url=${URL}`]);
  });

  it('catalog is a dry run by default; --apply backs up first and passes --apply on', async () => {
    expect((await run(['catalog', 'fedb'])).calls).toEqual([`catalog --source fedb url=${URL}`]);
    writeFileSync(log, '');
    expect((await run(['catalog', 'fedb', '--apply'])).calls).toEqual(['backup run url=', `catalog --source fedb --apply url=${URL}`]);
  });

  it('reader is a dry run without --apply: it makes no login and sets no secret', async () => {
    const r = await run(['reader'], { DB_READER: stub('reader', 'echo -n "postgresql://migrations_reader:r3ader@ep-prod.neon.tech/neondb"'), GH: stub('gh', '') });
    expect(r.status).toBe(0);
    expect(r.out).toContain('Dry run');
    expect(r.calls).toEqual([]);
  });
  it('reader --apply passes the owner URL to the maker and its URL to the secret, showing neither', async () => {
    const r = await run(['reader', '--apply'], {
      DB_READER: stub('reader', 'echo -n "postgresql://migrations_reader:r3ader@ep-prod.neon.tech/neondb"'),
      GH: stub('gh', `cat >> "${dir}/secret"`),
    });
    expect(r.status).toBe(0);
    expect(r.calls).toEqual([`reader  url=${URL}`, 'gh secret set MIGRATIONS_CHECK_URL --env production url=']);
    expect(readFileSync(join(dir, 'secret'), 'utf8')).toBe('postgresql://migrations_reader:r3ader@ep-prod.neon.tech/neondb');
    expect(r.out).not.toContain('r3ader');
    expect(r.out).not.toContain('s3cret');
    rmSync(join(dir, 'secret'));
  });
  it('reader --apply sets no secret when the login could not be made', async () => {
    const r = await run(['reader', '--apply'], { DB_READER: stub('reader', 'exit 1'), GH: stub('gh', '') });
    expect(r.status).not.toBe(0);
    expect(r.calls.filter(c => c.startsWith('gh'))).toEqual([]);
  });
  it('refuses a local database, a missing URL, or an unknown command, before doing anything', async () => {
    for (const local of ['postgres://u:p@127.0.0.1:5433/ironlog', 'postgres://u:p@localhost/ironlog']) {
      const r = await run(['migrate', '--apply'], { PROD_DATABASE_URL: local });
      expect(r.status).toBe(2);
      expect(r.out).toMatch(/not production/);
    }
    expect((await run(['catalog'])).status).toBe(2);
    expect((await run(['drop-everything'])).status).toBe(2);
    const help = await run([]);
    expect(help.status).toBe(2);
    for (const c of ['status', 'pending', 'migrate', 'catalog <source>']) expect(help.out).toContain(`  ${c}`); // the usage text lists every command
    expect(readFileSync(log, 'utf8')).toBe('');
  });
});
