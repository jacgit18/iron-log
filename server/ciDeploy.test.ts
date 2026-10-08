import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The two checks the CI deploy makes (scripts/ci-deploy.sh): is a database migration waiting, and did the new revision come up healthy.
const SCRIPT = resolve('scripts/ci-deploy.sh');
// Asynchronous on purpose: the smoke tests call a server in this same process, which a blocking spawn would freeze.
const run = (args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}) =>
  new Promise<{ status: number; stdout: string; stderr: string }>(done => {
    execFile('bash', [SCRIPT, ...args], { cwd: opts.cwd, env: { ...process.env, ...opts.env }, encoding: 'utf8' }, (err, stdout, stderr) =>
      done({ status: err ? Number((err as { code?: number }).code ?? 1) : 0, stdout, stderr }));
  });

describe('pending-migrations', () => {
  let dir: string;
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
  const commit = (files: Record<string, string>, message: string) => {
    for (const [name, text] of Object.entries(files)) { mkdirSync(join(dir, name, '..'), { recursive: true }); writeFileSync(join(dir, name), text); }
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', '--short', 'HEAD');
  };
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ci-deploy-'));
    git('init', '-q', '-b', 'main');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('says nothing waits when only code changed since the live revision, and lists a new migration when one was added', async () => {
    const live = commit({ 'db/migrations/001_a.sql': 'a', 'src/a.ts': '1' }, 'live');
    commit({ 'src/a.ts': '2' }, 'code only');
    expect(await run(['pending-migrations', live], { cwd: dir })).toMatchObject({ status: 0, stdout: '' });
    commit({ 'db/migrations/002_b.sql': 'b' }, 'adds a migration');
    const waiting = await run(['pending-migrations', live], { cwd: dir });
    expect(waiting.status).toBe(3);
    expect(waiting.stdout.trim()).toBe('db/migrations/002_b.sql');
  });

  it('counts an edited migration too (one already applied must never change)', async () => {
    const live = commit({ 'src/b.ts': '1' }, 'live 2');
    commit({ 'db/migrations/001_a.sql': 'changed' }, 'edits an old migration');
    expect((await run(['pending-migrations', live], { cwd: dir })).status).toBe(3);
  });

  it('is not fooled by a migration that was added before the live revision', async () => {
    commit({ 'db/migrations/003_c.sql': 'c' }, 'older migration');
    const live = commit({ 'src/c.ts': '1' }, 'live 3, after it');
    commit({ 'src/c.ts': '2' }, 'code only again');
    expect((await run(['pending-migrations', live], { cwd: dir })).status).toBe(0);
  });

  it('exits 2, not "nothing waiting", when the live commit is unknown', async () => {
    const out = await run(['pending-migrations', 'deadbee'], { cwd: dir });
    expect(out.status).toBe(2);
    expect(out.stderr).toContain('not in this checkout');
  });
});

describe('smoke', () => {
  let server: Server;
  let base: string;
  const answers = { health: 200, db: 200, page: 200, me: 401 };
  let calls = 0;
  beforeAll(async () => {
    server = createServer((req, res) => {
      calls++;
      const code = req.url === '/api/health' ? answers.health : req.url === '/api/health/db' ? answers.db : req.url === '/privacy.html' ? answers.page : req.url === '/api/me' ? answers.me : 404;
      res.statusCode = code;
      res.end('{}');
    }).listen(0);
    await new Promise(done => server.once('listening', done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>(done => server.close(() => done())));
  const smoke = () => run(['smoke', base], { env: { SMOKE_ATTEMPTS: '2', SMOKE_SLEEP: '0' } });
  const set = (over: Partial<typeof answers>) => { Object.assign(answers, { health: 200, db: 200, page: 200, me: 401 }, over); calls = 0; };

  it('passes when the API, the database login, the app and the anonymous refusal are all right', async () => {
    set({});
    const out = await smoke();
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('Smoke test passed');
  });

  it.each([
    ['the API is down', { health: 503 }],
    ['the database login does not work', { db: 503 }],
    ['the app\'s own files are missing', { page: 404 }],
    ['an anonymous caller is let in', { me: 200 }],
    ['sign-in is broken and answers 500', { me: 500 }],
  ])('fails, after retrying, when %s', async (_name, over) => {
    set(over);
    const out = await smoke();
    expect(out.status).toBe(1);
    expect(out.stdout).toContain('Attempt 2 of 2');
    expect(calls).toBeGreaterThanOrEqual(8); // both attempts asked all four things
  });

  it('fails when nothing answers at all', async () => {
    const out = await run(['smoke', 'http://127.0.0.1:1'], { env: { SMOKE_ATTEMPTS: '1', SMOKE_SLEEP: '0' } });
    expect(out.status).toBe(1);
  });
});
