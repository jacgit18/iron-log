import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commitOf, decide, ownerProblem, safeName } from './migrate-run.mjs';

// Every file an entry script reaches through relative imports, found by reading the files (not from a list kept by hand): a job image copies single
// files, so an import of a file the Dockerfile does not copy only fails once the image is built and run. Paths are relative to the repository root.
const importsOf = file => [...readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map(m => join(dirname(file), m[1]));
const reachableFrom = entry => {
  const seen = new Set();
  const walk = f => { if (seen.has(f)) return; seen.add(f); if (/\.(mjs|js|ts)$/.test(f)) importsOf(f).forEach(walk); };
  walk(entry);
  return [...seen];
};

// scripts/migrate-run.mjs: the production migrate job decides what to apply, and refuses what is destructive, inside Google Cloud, so the decision is
// tested here on file text and applied versions, with no database. Brief: production-migrate-job.
const add = '-- migrate:up\ncreate table t (id int);\n-- migrate:down\ndrop table t;\n';
const drop = '-- migrate:up\ndrop table old_things;\n-- migrate:down\n';

describe('decide', () => {
  it('lists the files production has not applied, sorted, and ignores anything that is not a migration', () => {
    const files = { '20261002000001_b.sql': add, '20261001000001_a.sql': add, 'COMMIT': 'abc1234', 'notes.txt': 'x' };
    expect(decide(files, new Set(['20261001000001'])).pending).toEqual(['20261002000001_b.sql']);
    expect(decide(files, new Set()).pending).toEqual(['20261001000001_a.sql', '20261002000001_b.sql']);
  });
  it('has nothing to do when production has every migration', () => {
    const r = decide({ '20261001000001_a.sql': add }, new Set(['20261001000001']));
    expect(r).toEqual({ pending: [], destructive: [] });
  });
  it('flags a pending destructive migration, with the reason, and does not flag an applied one', () => {
    const files = { '20261001000001_old.sql': drop, '20261002000001_new.sql': add };
    expect(decide(files, new Set()).destructive).toEqual([{ file: '20261001000001_old.sql', why: ['drops a table'] }]);
    expect(decide(files, new Set(['20261001000001'])).destructive).toEqual([]); // already applied by hand
  });
  it('finds no destructive migration among the real ones (a new destructive migration, or a change in the guard, must show up here)', () => {
    const dir = 'db/migrations';
    const files = Object.fromEntries(readdirSync(dir).filter(f => f.endsWith('.sql')).map(f => [f, readFileSync(`${dir}/${f}`, 'utf8')]));
    expect(Object.keys(files).length).toBeGreaterThan(20); // the folder was read
    // The same guard the runner uses. If a migration is destructive on purpose, list it here with its reasons: it is applied by hand, never by the job.
    expect(decide(files, new Set()).destructive).toEqual([]);
  });
});

describe('safeName', () => {
  it('accepts only <version>_<name>.sql', () => {
    expect(safeName('20261001000001_grocery.sql')).toBe(true);
    for (const bad of ['../20261001000001_x.sql', '20261001000001_a/b.sql', 'x.sql', '20261001000001_x.sh', '1_x.sql', '20261001000001_..x.sql']) expect(safeName(bad), bad).toBe(false);
  });
});

describe('ownerProblem and commitOf', () => {
  it('refuses a missing or pooled owner URL, and accepts the direct one', () => {
    expect(ownerProblem('')).toContain('not set');
    expect(ownerProblem('postgres://o:p@ep-a-pooler.c-6.us-east-2.aws.neon.tech/db')).toContain('pooled');
    expect(ownerProblem('postgres://o:p@ep-a.c-6.us-east-2.aws.neon.tech/db')).toBe('');
  });
  it('accepts a plain commit id and nothing else', () => {
    expect(commitOf('d7b69bff\n')).toBe('d7b69bff');
    expect(commitOf('; rm -rf /')).toBe('');
    expect(commitOf(undefined)).toBe('');
  });
});

describe('the job image and the scripts around it', () => {
  const run = readFileSync('scripts/migrate-run.mjs', 'utf8');
  const docker = readFileSync('migrate/Dockerfile', 'utf8');
  it('never prints a URL: no console call mentions the owner or reader variables', () => {
    for (const l of run.split('\n').filter(l => /console\.(log|error)|\bsay\(|\bstop\(/.test(l))) expect(l, l).not.toMatch(/process\.env\.(OWNER|READER)_DATABASE_URL|\$\{(owner|reader)\}/);
  });
  it('copies every file the entry script imports into the image, and runs no install script', () => {
    // The entry's own imports, plus the script it starts as a separate process (same-database.mjs, with what that one imports).
    const needed = [...new Set([...reachableFrom('scripts/migrate-run.mjs'), ...reachableFrom('scripts/same-database.mjs')])];
    expect(needed.length).toBeGreaterThan(5); // the walk found the chain, not just the entry
    expect(needed).toContain('scripts/lib/ssl-mode.mjs');
    for (const f of needed) expect(docker, f).toContain(`COPY ${f} `);
    expect(docker.match(/npm ci [^\n]*/g)?.every(l => l.includes('--ignore-scripts'))).toBe(true);
  });
  it('migrate-job.sh deploy guards every file the image contains, and builds only from main', () => {
    const sh = readFileSync('scripts/migrate-job.sh', 'utf8');
    const guard = sh.match(/local files=\(([^)]*)\)/)?.[1].split(/\s+/) ?? [];
    const copied = [...docker.matchAll(/^COPY (?!--from)(\S+) /gm)].map(m => m[1]).filter(f => f !== 'package.json');
    expect(copied.length).toBeGreaterThan(4);
    for (const f of copied) expect(guard, f).toContain(f);
    for (const f of ['migrate', 'cloudbuild-migrate.yaml', 'package.json', 'package-lock.json']) expect(guard, f).toContain(f);
    expect(sh).toMatch(/cmd_deploy\(\) \{[\s\S]*git branch --show-current\)" = main[\s\S]*gc builds submit/);
    expect(sh).toContain('git diff origin/main -- "${files[@]}"');
  });
  it('migrate-job.sh gives the job exactly the two secrets and refuses to run from a branch other than main', () => {
    const sh = readFileSync('scripts/migrate-job.sh', 'utf8');
    expect(sh).toContain('OWNER_DATABASE_URL=${OWNER_SECRET}:latest,READER_DATABASE_URL=${READER_SECRET}:latest');
    expect(sh).toContain('--max-retries 0');
    expect(sh).toMatch(/\[ "\$\(git branch --show-current\)" = main \]/);
  });
});

describe('the parity job image', () => {
  const docker = readFileSync('parity/Dockerfile', 'utf8');
  it('copies every file the entry script reaches through its imports, so the report starts', () => {
    const needed = reachableFrom('scripts/env-parity.mjs');
    expect(needed.length).toBeGreaterThan(3);
    expect(needed).toContain('scripts/lib/ssl-mode.mjs');
    for (const f of needed) expect(docker, f).toContain(`COPY ${f} `);
  });
});
