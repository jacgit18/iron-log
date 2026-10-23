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
        DBMATE: join(dir, 'dbmate'), BACKUP: join(dir, 'backup'), CATALOG_IMPORT: join(dir, 'catalog'), BETA_TO_FREE: join(dir, 'beta-to-free'), KEEP_INJURY: join(dir, 'keep-injury'), ENCRYPT_USERS: join(dir, 'encrypt-users'), FIND_USER: join(dir, 'find-user'), PII_KEY_CMD: join(dir, 'pii-key'), ...env,
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
  stub('beta-to-free', '');
  stub('keep-injury', '');
  stub('find-user', 'echo "key=${PII_ENCRYPTION_KEY:+set}" >> "' + log + '"');
  stub('encrypt-users', 'echo "key=${PII_ENCRYPTION_KEY:+set}" >> "' + log + '"');
  stub('pii-key', 'echo -n "a2V5LXZhbHVlLXRoYXQtbXVzdC1ub3QtYmUtc2hvd24="');
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

  it('beta-to-free is a dry run by default; --apply backs up first and passes --apply on', async () => {
    const dry = await run(['beta-to-free']);
    expect(dry.calls).toEqual([`beta-to-free  url=${URL}`]);
    expect(dry.out).toContain('database: ep-prod.neon.tech/neondb');
    expect(dry.out).not.toContain('s3cret');
    writeFileSync(log, '');
    expect((await run(['beta-to-free', '--apply'])).calls).toEqual(['backup run url=', `beta-to-free --apply url=${URL}`]);
  });

  it('injury-default is a dry run by default; --apply backs up first and passes --apply on', async () => {
    expect((await run(['injury-default'])).calls).toEqual([`keep-injury  url=${URL}`]);
    writeFileSync(log, '');
    expect((await run(['injury-default', '--apply'])).calls).toEqual(['backup run url=', `keep-injury --apply url=${URL}`]);
  });

  it('encrypt-users is a dry run by default; --apply backs up first; the key reaches the command but is never shown', async () => {
    const dry = await run(['encrypt-users']);
    expect(dry.calls).toEqual(['pii-key  url=', `encrypt-users  url=${URL}`, 'key=set']);
    expect(dry.out).not.toContain('a2V5LXZhbHVl');
    writeFileSync(log, '');
    const applied = await run(['encrypt-users', '--apply']);
    expect(applied.calls).toEqual(['pii-key  url=', 'backup run url=', `encrypt-users --apply url=${URL}`, 'key=set']);
    expect(applied.out).not.toContain('a2V5LXZhbHVl');
  });

  it('find-user reads only: no backup, the key reaches the command but is never shown, and the address is passed along', async () => {
    const r = await run(['find-user', 'someone@example.com']);
    expect(r.calls).toEqual(['pii-key  url=', `find-user someone@example.com url=${URL}`, 'key=set']);
    expect(r.out).not.toContain('s3cret');
    expect((await run(['find-user'])).status).toBe(2);
  });

  it('encrypt-users stops, changing nothing, when Secret Manager gives no key', async () => {
    const r = await run(['encrypt-users', '--apply'], { PII_KEY_CMD: stub('no-key', 'true') });
    expect(r.status).toBe(1);
    expect(r.calls.some(c => c.startsWith('backup') || c.startsWith('encrypt-users'))).toBe(false);
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
    for (const c of ['status', 'pending', 'migrate', 'catalog <source>', 'injury-default', 'beta-to-free', 'encrypt-users', 'find-user <email>', 'reader']) expect(help.out).toContain(`  ${c}`); // the usage text lists every command
    expect(readFileSync(log, 'utf8')).toBe('');
  });
});

// Where production's owner URL comes from (secrets-and-keys-hygiene, item 2): the environment, else Secret Manager on demand, else (with a
// warning) the old .env line. It is never printed, and storing it shows nothing.
describe('the production URL source', () => {
  const SECRET_URL = 'postgres://owner:fetched-pw@ep-prod-1.us-east-2.aws.neon.tech/neondb';
  const noEnv = (extra: Record<string, string> = {}) => ({ PROD_DATABASE_URL: '', ENV_FILE: join(dir, 'no-such.env'), ...extra });
  it('fetches the URL from Secret Manager when PROD_DATABASE_URL is not set, and never prints it', async () => {
    dbmateWith([]);
    const r = await run(['status'], noEnv({ FETCH_URL: stub('fetch', `printf '%s' '${SECRET_URL}'`) }));
    expect(r.status).toBe(0);
    expect(r.calls.some(c => c.startsWith('dbmate status') && c.includes('fetched-pw'))).toBe(true);
    expect(r.out).not.toContain('fetched-pw');
    expect(r.out).toContain('database: ep-prod-1.us-east-2.aws.neon.tech/neondb');
  });
  it('prefers PROD_DATABASE_URL to the secret', async () => {
    dbmateWith([]);
    const r = await run(['status'], { FETCH_URL: stub('fetch', `printf '%s' '${SECRET_URL}'`) });
    expect(r.calls.some(c => c.startsWith('dbmate status') && c.includes('fetched-pw'))).toBe(false);
  });
  it('falls back to the old .env line with a warning, and says how to move it', async () => {
    dbmateWith([]);
    const env = join(dir, 'old.env');
    writeFileSync(env, 'OTHER=1\nDATABASE_URL_UNPOOLED="postgres://owner:dotenv-pw@ep-prod-2.us-east-2.aws.neon.tech/neondb"\n');
    const r = await run(['status'], noEnv({ ENV_FILE: env, FETCH_URL: stub('fetch', 'exit 1') }));
    expect(r.status).toBe(0);
    expect(r.out).toContain('Warning: using the production URL in .env');
    expect(r.out).not.toContain('dotenv-pw');
  });
  it('stops with a clear message when there is no URL anywhere', async () => {
    const r = await run(['status'], noEnv({ FETCH_URL: stub('fetch', 'exit 1') }));
    expect(r.status).toBe(2);
    expect(r.out).toContain('No production URL');
  });
  it('store-owner-url is a dry run without --apply, and with it stores the URL without showing it', async () => {
    const gcloud = stub('gcloud', 'case "$*" in *"versions add"*) cat >/dev/null;; esac; exit 0');
    const dry = await run(['store-owner-url'], { GCLOUD: gcloud });
    expect(dry.status).toBe(0);
    expect(dry.out).toContain('Dry run');
    expect(dry.calls.some(c => c.startsWith('gcloud'))).toBe(false);
    const done = await run(['store-owner-url', '--apply'], { GCLOUD: gcloud });
    expect(done.status).toBe(0);
    expect(done.calls.some(c => c.includes('secrets versions add iron-log-prod-owner-url'))).toBe(true);
    expect(done.out).not.toContain(URL.split('@')[0]);
  });
  it('store-owner-url refuses a pooled URL', async () => {
    const r = await run(['store-owner-url', '--apply'], { PROD_DATABASE_URL: 'postgres://o:p@ep-x-pooler.us-east-2.aws.neon.tech/neondb', GCLOUD: stub('gcloud', 'exit 0') });
    expect(r.status).toBe(2);
    expect(r.out).toContain('pooled');
  });
});
