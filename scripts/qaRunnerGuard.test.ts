// The allow/deny decision of scripts/qa-runner-guard.mjs, the PreToolUse hook that keeps the QA Runner agent inside the local stack and the evidence folder.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createStateFile, liveStackUrl, originProblem, readStackUrls, stackServerProblem, readStateText, updateStateFile } from './qa-local.mjs';
import { bashProblem, decide, pathProblem, underEvidence, words } from './qa-runner-guard.mjs';

const root = '/tmp/qa-runs';
const stackUrl = 'http://127.0.0.1:41234';
const DB = 'iron_qa_run_deadbeef';
const START_ENV = { NODE_ENV: 'test', HOST: '127.0.0.1', AUTH_TEST_SIGNIN: 'true', PORT: '41234', DATABASE_URL: `postgres://u:p@127.0.0.1:5433/${DB}` };
/** A real child process standing in for the stack's server: its command line names server/index.ts, it runs in this checkout, and its environment is what `start` gives the server unless `env` changes it. */
const fakeStack = (env: Record<string, string> = {}) => spawn('node', ['-e', 'setTimeout(()=>{},60000)', 'server/index.ts'], { stdio: 'ignore', cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, ...START_ENV, ...env } });
const record = (pid: number | undefined, extra: Record<string, unknown> = {}) => ({ url: stackUrl, port: 41234, db: DB, pid, scratch: START_ENV.DATABASE_URL.replace('u:p@', ''), ...extra });
const ok = (cmd: string) => expect(bashProblem(cmd, root)).toBeNull();
const no = (cmd: string) => expect(bashProblem(cmd, root)).not.toBeNull();

describe('bashProblem', () => {
  it.each([
    'npx tsx scripts/qa-local.mjs start', 'npx tsx scripts/qa-local.mjs start --no-build', 'npx tsx scripts/qa-local.mjs seed qa-new', 'npx tsx scripts/qa-local.mjs seed qa-local-admin', 'npx tsx scripts/qa-local.mjs status',
    'npx tsx scripts/qa-local.mjs stop', 'npx tsx scripts/qa-local.mjs check-url http://127.0.0.1:41234', 'npx tsx scripts/qa-local.mjs check-url "http://127.0.0.1:41234/a?b=1&c=2"',
    'git rev-parse --short HEAD', 'git rev-parse HEAD', 'git status', 'git status --short', 'mkdir -p /tmp/qa-runs/S-270',
    'node scripts/qa-scenarios-doc.mjs --record S-270 pass "saw it; all; fine" --by claude --build abc1234 --results /tmp/qa-runs/S-270/results.json',
    'node scripts/qa-scenarios-doc.mjs --record S-270 blocked --by claude --build abc1234 --results /tmp/qa-runs/results.json',
    'node scripts/qa-scenarios-doc.mjs --record S-110 pass "phone view" --by claude --emulated --build abc1234 --results /tmp/qa-runs/S-110/results.json',
    'node scripts/qa-scenarios-doc.mjs --record S-110 blocked --emulated --by claude --build abc1234 --results /tmp/qa-runs/S-110/results.json',
  ])('allows %s', ok);
  it.each([
    'node scripts/qa-scenarios-doc.mjs --record S-110 pass "n" --by claude --emulated --emulated --build abc1234 --results /tmp/qa-runs/r.json',
    'node scripts/qa-scenarios-doc.mjs --record S-110 pass "n" --by claude --emulated true --build abc1234 --results /tmp/qa-runs/r.json',
    'node scripts/qa-scenarios-doc.mjs --record S-110 pass "n" --by owner --emulated --build abc1234 --results /tmp/qa-runs/r.json',
    'node scripts/qa-scenarios-doc.mjs --record S-110 pass "n" --by claude --emulated --build abc1234 --results ops/qa-results.json',
  ])('still refuses %s', no);
  it.each([
    'cat .env', 'grep -r key .', 'ls', 'curl https://iron-log-qa.a.run.app', 'git push', 'git commit -m x', 'git status && cat .env', 'git status; cat .env', 'git status | tee /etc/x',
    'git status > /tmp/x', 'git status $(cat .env)', 'git status `id`', 'git status\ncat .env', 'echo hi | tee /tmp/qa-runs/x', 'tee /tmp/other', 'mkdir -p /tmp/elsewhere', 'mkdir -p /tmp/qa-runs/../etc', 'mkdir -p relative/qa-runs',
    'npx tsx scripts/qa-local.mjs seed', 'npx tsx scripts/qa-local.mjs seed "x; y"', 'npx tsx scripts/qa-local.mjs start --force', 'npx tsx scripts/qa-local.mjs stop now', 'npx tsx scripts/qa-local.mjs',
    'npx tsx scripts/other.mjs', 'npx tsx scripts/qa-local.mjs/../seed qa-new x', 'node -e "1"', 'node scripts/qa-scenarios-doc.mjs --write', 'node scripts/qa-scenarios-doc.mjs --record S-270 pass "n" --by owner --build abc1234 --results /tmp/qa-runs/r.json',
    'node scripts/qa-scenarios-doc.mjs --record S-270 pass "n" --by claude --build abc1234 --results ops/qa-results.json', 'node scripts/qa-scenarios-doc.mjs --record S-270 pass "n" --by claude --build abc1234',
    'node scripts/qa-scenarios-doc.mjs --record S-270 pass "n" --by claude --build abc1234 --results /tmp/qa-runs/../ops/qa-results.json', 'node scripts/qa-scenarios-doc.mjs --record S-270 pass "n" --by claude --build "$(id)" --results /tmp/qa-runs/r.json',
    'node scripts/qa-scenarios-doc.mjs --record S-270 pass "n" --by claude --build abc1234 --results /tmp/qa-runs/r.json --date 2026-01-01', 'node scripts/qa-scenarios-doc.mjs --record ../x pass --by claude --build abc1234 --results /tmp/qa-runs/r.json',
    'git rev-parse --short HEAD extra', 'git rev-parse --abbrev-ref HEAD', 'git status --short -- .env', 'git status *', '', '   ',
  ])('refuses %j', no);
});

describe('words', () => {
  it('keeps operators inside quotes as plain text and drops the quotes', () => expect(words('a "b; c | d" \'e\'')).toEqual({ words: ['a', 'b; c | d', 'e'] }));
  it('refuses a dollar sign even inside double quotes', () => expect(words('a "$HOME"').problem).toBeDefined());
  it('refuses an unclosed quote', () => expect(words('a "b').problem).toBeDefined());
});

describe('underEvidence', () => {
  it.each(['/tmp/qa-runs', '/tmp/qa-runs/S-1/evidence.txt'])('allows %s', p => expect(underEvidence(p, root)).toBe(true));
  it.each(['/tmp/qa-runs-evil/x', '/tmp/qa-runs/../x', '/tmp', 'qa-runs/x', '', undefined])('refuses %s', p => expect(underEvidence(p as string, root)).toBe(false));
});

describe('pathProblem', () => {
  const repo = '/work/iron-log';
  it.each(['/work/iron-log/server/qa/personas.ts', '/work/iron-log/.env.example', 'src/lib/logic.ts', '/tmp/qa-runs/S-1/evidence.txt'])('allows reading %s', p => expect(pathProblem(p, { root, repo })).toBeNull());
  it.each(['/work/iron-log/.env', '.env', '.env.production', '/work/iron-log/server/.env.local', '/home/jac/.ssh/id_rsa', '/etc/passwd', '/tmp/qa-local-abc.json', '/work/iron-log/../other/x.ts', '/work/iron-log/.git/config', 'key.pem'])('refuses reading %s', p => expect(pathProblem(p, { root, repo })).not.toBeNull());
  it('allows a write under the evidence folder only', () => {
    expect(pathProblem('/tmp/qa-runs/S-1/evidence.txt', { write: true, root, repo })).toBeNull();
    for (const p of ['/work/iron-log/src/x.ts', 'server/qa/scenarios/S-1.ts', '/tmp/qa-runs/../x', '/tmp/qa-runs/.env']) expect(pathProblem(p, { write: true, root, repo })).not.toBeNull();
  });
});

describe('decide', () => {
  const d = (tool_name: string, tool_input: Record<string, unknown>) => decide({ tool_name, tool_input }, { root, stackUrl, repo: '/work/iron-log' });
  it('lets the browser open the running stack', () => {
    for (const url of ['http://127.0.0.1:41234', 'http://127.0.0.1:41234/progress', 'http://127.0.0.1:41234/qa-signin-erased-account.html?s=0123456789ab']) expect(d('mcp__Claude_Browser__navigate', { url })).toBeNull();
  });
  it.each(['https://iron-log-qa.a.run.app', 'https://loadbearer.app', 'http://127.0.0.1:4173', 'http://127.0.0.1:41235', 'http://localhost:41234', 'http://127.0.0.1:41234@evil.com', 'about:blank', 'back', 'forward', 'javascript:alert(1)', 'file:///etc/passwd', ''])('refuses navigate to %j', url => {
    expect(d('mcp__Claude_Browser__navigate', { url })).not.toBeNull();
  });
  it('allows resize_window only to the mobile or desktop preset', () => {
    for (const preset of ['mobile', 'desktop']) expect(d('mcp__Claude_Browser__resize_window', { preset })).toBeNull();
    for (const input of [{ width: 375, height: 812 }, { preset: 'tablet' }, { preset: 'mobile', width: 9999 }, { preset: 'mobile', tabId: 'other' }, {}]) expect(d('mcp__Claude_Browser__resize_window', input)).toMatch(/preset mobile/);
  });
  it('refuses every navigation when no stack is running', () => expect(decide({ tool_name: 'mcp__Claude_Browser__navigate', tool_input: { url: stackUrl } }, { root, stackUrl: null })).toMatch(/no stack/));
  it('checks browser code, Bash, Write, Read, Grep and Glob', () => {
    expect(d('mcp__Claude_Browser__javascript_tool', { text: '({data: 1})' })).toMatch(/not a tool of the QA Runner/);
    expect(d('Bash', { command: 'cat .env' })).not.toBeNull();
    expect(d('Write', { file_path: '/work/iron-log/src/x.ts', content: '' })).not.toBeNull();
    expect(d('Write', { file_path: '/tmp/qa-runs/S-1/evidence.txt', content: 'x' })).toBeNull();
    expect(d('Read', { file_path: '/work/iron-log/.env' })).not.toBeNull();
    expect(d('Grep', { pattern: 'x', path: '/etc' })).not.toBeNull();
    expect(d('Grep', { pattern: 'x', glob: '.env*' })).not.toBeNull();
    expect(d('Grep', { pattern: 'x', path: 'server/qa' })).toBeNull();
    expect(d('Glob', { pattern: 'server/qa/scenarios/S-*.ts' })).toBeNull();
    expect(d('Glob', { pattern: '**/.env*' })).not.toBeNull();
    expect(d('Glob', { pattern: '/home/jac/.ssh/*' })).not.toBeNull();
    expect(d('Glob', { pattern: '../other/*.ts' })).not.toBeNull();
    expect(d('Glob', { pattern: '/work/iron-log/src/**/*.ts' })).toBeNull();
    expect(d('Glob', { pattern: '/work/iron-log/src/**/*.ts', path: '/etc' })).not.toBeNull(); // the path is still checked
    expect(d('Grep', { pattern: 'x', path: '/work/iron-log/.env.example' })).toBeNull();
  });
  it('refuses a tool that is not the Runner\'s', () => {
    expect(d('Edit', { file_path: '/tmp/qa-runs/x' })).not.toBeNull();
    expect(d('mcp__Claude_Browser__tabs_create', {})).not.toBeNull();
  });
});

describe('the hook process', () => {
  const script = fileURLToPath(new URL('./qa-runner-guard.mjs', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'qa-guard-test-'));
  // A stand-in for the stack's server: a live process whose command line names server/index.ts, as the guard's pid check wants.
  const server = fakeStack();
  afterAll(() => { server.kill(); });
  const state = (text: string) => { const f = join(dir, `state-${Math.random().toString(36).slice(2)}.json`); writeFileSync(f, text); return f; };
  // Started from another directory with a fake state file, as Claude Code starts it from wherever the session is.
  const run = (input: string, stateFile = state(JSON.stringify(record(server.pid)))) => spawnSync('node', [script], { input, encoding: 'utf8', cwd: tmpdir(), env: { ...process.env, QA_LOCAL_STATE_FILE: stateFile } });
  const call = (tool_name: string, tool_input: Record<string, unknown>) => JSON.stringify({ tool_name, tool_input });
  it('exits 2 with a reason when it refuses', () => {
    const r = run(call('Bash', { command: 'cat .env' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/refused/);
  });
  it('exits 0 for an allowed call', () => expect(run(call('Bash', { command: 'git status --short' })).status).toBe(0));
  it('reads the stack address from the state file for navigate', () => {
    expect(run(call('mcp__Claude_Browser__navigate', { url: `${stackUrl}/` })).status).toBe(0);
    expect(run(call('mcp__Claude_Browser__navigate', { url: 'http://127.0.0.1:41999/' })).status).toBe(2);
    expect(run(call('mcp__Claude_Browser__navigate', { url: 'https://example.com' })).status).toBe(2);
  });
  it('resolves a relative Read path against the checkout, not the directory it was started from', () => {
    expect(run(call('Read', { file_path: 'package.json' })).status).toBe(0);
    expect(run(call('Read', { file_path: '.env' })).status).toBe(2);
  });
  describe('with a corrupt state file', () => {
    const bad = state('{not json');
    it.each(['npx tsx scripts/qa-local.mjs status', 'npx tsx scripts/qa-local.mjs stop', 'git status'])('still lets %s run', command => expect(run(call('Bash', { command }), bad).status).toBe(0));
    it('refuses navigate, as if no stack were running', () => expect(run(call('mcp__Claude_Browser__navigate', { url: stackUrl }), bad).status).toBe(2));
  });
  it.each(['', 'not json', 'null', '[]', '{}', '{"tool_name":"Bash","tool_input":null}', '{"tool_name":"Bash"}'])('fails closed on input %j', input => expect(run(input).status).toBe(2));
});

describe('a stack started from another checkout (worktree)', () => {
  const alive = () => true as const;
  const rec = { url: stackUrl, port: 41234, pid: 4242 };
  it('is allowed when the recorded pid is alive', () => expect(originProblem(`${stackUrl}/#/daily`, [liveStackUrl(rec, alive)])).toBeNull());
  it('is refused when the pid is dead', () => expect(liveStackUrl(rec, () => false)).toBeNull());
  it('is refused with no pid yet (start has not finished)', () => expect(liveStackUrl({ ...rec, pid: null }, alive)).toBeNull());
  it('is refused when the port is not the recorded one', () => expect(liveStackUrl({ ...rec, port: 41999 }, alive)).toBeNull());
  it.each(['http://localhost:41234', 'http://0.0.0.0:41234', 'http://192.168.1.5:41234', 'https://127.0.0.1:41234', 'https://example.com'])('is refused for %s', url => expect(liveStackUrl({ ...rec, url }, alive)).toBeNull());
  it.each([3101, 3102, 4173, 5433])('is refused on the reserved port %i', port => expect(liveStackUrl({ url: `http://127.0.0.1:${port}`, port, pid: 4242 }, alive)).toBeNull());
  it('is refused for a malformed record', () => { for (const r of [null, {}, { url: 5 }, { url: 'nope', port: 1, pid: 2 }]) expect(liveStackUrl(r as never, alive)).toBeNull(); });
  it('accepts any of several live stacks and refuses other ports', () => {
    const stacks = ['http://127.0.0.1:41234', 'http://127.0.0.1:41235'];
    expect(originProblem('http://127.0.0.1:41235/', stacks)).toBeNull();
    expect(originProblem('http://127.0.0.1:1', stacks)).not.toBeNull();
    expect(originProblem('https://example.com', stacks)).not.toBeNull();
    expect(originProblem(stackUrl, [])).toMatch(/no stack/);
  });
  it('reads a state file from the temp folder that another checkout wrote, and ignores a dead one', () => {
    const d = mkdtempSync(join(tmpdir(), 'qa-guard-tmp-'));
    const server = fakeStack();
    const prev = process.env.TMPDIR; const prevState = process.env.QA_LOCAL_STATE_FILE;
    try {
      process.env.TMPDIR = d; delete process.env.QA_LOCAL_STATE_FILE;
      writeFileSync(join(d, 'qa-local-aaaaaaaaaa.json'), JSON.stringify(record(server.pid)));
      writeFileSync(join(d, 'qa-local-bbbbbbbbbb.json'), JSON.stringify({ ...record(2 ** 22 + 12345), url: 'http://127.0.0.1:41235', port: 41235 }));
      writeFileSync(join(d, 'other.json'), JSON.stringify({ url: 'http://127.0.0.1:41236', port: 41236, pid: process.pid }));
      expect(readStackUrls()).toEqual([stackUrl]); // the live one from the 'other checkout' only: not the dead pid, not a file with another name
    } finally { server.kill(); if (prev === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = prev; if (prevState !== undefined) process.env.QA_LOCAL_STATE_FILE = prevState; rmSync(d, { recursive: true, force: true }); }
  });
});

describe('what counts as a live stack server', () => {
  const checkout = (d: string) => d === '/work/wt';
  const env = (o: Record<string, string> = {}) => Object.entries({ ...START_ENV, ...o }).map(([k, v]) => `${k}=${v}`).join('\0') + '\0';
  const ok = { cmdline: 'npx tsx server/index.ts', cwd: '/work/wt', environ: env() };
  const st = record(1);
  it('accepts the stack server of any checkout', () => expect(stackServerProblem(ok, st, checkout)).toBeNull());
  it('refuses a live process that is not server/index.ts', () => expect(stackServerProblem({ ...ok, cmdline: 'node other.js' }, st, checkout)).not.toBeNull());
  it('refuses a server whose folder is not a checkout', () => expect(stackServerProblem({ ...ok, cwd: '/elsewhere' }, st, checkout)).not.toBeNull());
  it.each([['PORT', '5173'], ['NODE_ENV', 'production'], ['HOST', '0.0.0.0'], ['AUTH_TEST_SIGNIN', 'false'], ['DATABASE_URL', 'postgres://u@127.0.0.1:5433/ironlog']])('refuses a server with %s=%s', (k, v) => expect(stackServerProblem({ ...ok, environ: env({ [k]: v }) }, st, checkout)).not.toBeNull());
  it.each(['PORT', 'NODE_ENV', 'HOST', 'AUTH_TEST_SIGNIN', 'DATABASE_URL'])('refuses a server with no %s', k => {
    const { [k]: _gone, ...rest } = START_ENV as Record<string, string>;
    expect(stackServerProblem({ ...ok, environ: Object.entries(rest).map(([a, b]) => `${a}=${b}`).join('\0') }, st, checkout)).not.toBeNull();
  });
  it('refuses a server on another scratch database than the record names, or a record with no scratch name', () => {
    expect(stackServerProblem(ok, record(1, { db: 'iron_qa_run_00000000' }), checkout)).not.toBeNull();
    expect(stackServerProblem(ok, record(1, { db: 'ironlog' }), checkout)).not.toBeNull();
  });
  it.each([
    ['another host', `postgres://u:p@192.168.1.5:5433/${DB}`],
    ['another port', `postgres://u:p@127.0.0.1:5434/${DB}`],
    ['a query the record does not have', `postgres://u:p@127.0.0.1:5433/${DB}?x=%zz`],
    ['an unparseable URL', 'not a url'],
  ])('refuses a server whose DATABASE_URL has %s', (_n, url) => expect(stackServerProblem({ ...ok, environ: env({ DATABASE_URL: url }) }, st, checkout)).not.toBeNull());
  it('accepts the same host, port and query whatever the login', () => expect(stackServerProblem({ ...ok, environ: env({ DATABASE_URL: `postgres://other:x@127.0.0.1:5433/${DB}` }) }, st, checkout)).toBeNull());
  it('refuses when the record has a different query, or no readable scratch URL', () => {
    expect(stackServerProblem(ok, record(1, { scratch: `postgres://u@127.0.0.1:5433/${DB}?sslmode=disable` }), checkout)).not.toBeNull();
    for (const scratch of [undefined, 'nope', 5]) expect(stackServerProblem(ok, record(1, { scratch }), checkout)).not.toBeNull();
  });
  it('fails closed when a reading is missing (unreadable /proc)', () => {
    for (const bad of [{ ...ok, environ: null }, { ...ok, cwd: null }, { ...ok, cmdline: null }]) expect(stackServerProblem(bad as never, st, checkout)).not.toBeNull();
  });
  it('treats a non-true answer from the liveness check as not live', () => expect(liveStackUrl(record(4242), (() => 'yes') as never)).toBeNull());
  describe('with real child processes', () => {
    const kids: ReturnType<typeof spawn>[] = [];
    afterAll(() => { for (const k of kids) k.kill(); });
    const wait = () => new Promise(r => setTimeout(r, 300)); // let the child exec so /proc shows its command line
    it('accepts a real stack server', async () => { const k = fakeStack(); kids.push(k); await wait(); expect(liveStackUrl(record(k.pid))).toBe(stackUrl); });
    it('refuses a server/index.ts process with the right PORT but without the start markers', async () => {
      const k = fakeStack({ AUTH_TEST_SIGNIN: 'false' }); kids.push(k); await wait();
      expect(liveStackUrl(record(k.pid))).toBeNull();
      const j = spawn('node', ['-e', 'setTimeout(()=>{},60000)', 'server/index.ts'], { stdio: 'ignore', cwd: fileURLToPath(new URL('..', import.meta.url)), env: { PATH: process.env.PATH ?? '', PORT: '41234' } }); kids.push(j); await wait();
      expect(liveStackUrl(record(j.pid))).toBeNull();
    });
    it('refuses a process that is not a stack, and this test process, and a gone pid', async () => {
      const k = spawn('node', ['-e', 'setTimeout(()=>{},60000)'], { stdio: 'ignore', env: { ...process.env, ...START_ENV } }); kids.push(k); await wait();
      expect(liveStackUrl(record(k.pid))).toBeNull();
      expect(liveStackUrl(record(process.pid))).toBeNull();
      expect(liveStackUrl(record(2 ** 22 + 12345))).toBeNull();
    });
  });
});

describe('which state files are read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-guard-files-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const file = (name: string, text: string) => { const f = join(dir, name); writeFileSync(f, text); return f; };
  it('reads a small regular file of this user', () => expect(readStateText(file('a.json', '{"a":1}'))).toBe('{"a":1}'));
  it('refuses an oversize file', () => expect(() => readStateText(file('big.json', ' '.repeat(5000)))).toThrow());
  it('refuses a directory', () => expect(() => readStateText(dir)).toThrow());
  it('refuses a symlink, even to a good file', () => { const f = file('t.json', '{}'); const l = join(dir, 'link.json'); symlinkSync(f, l); expect(() => readStateText(l)).toThrow(); });
  it('refuses a pipe without waiting on it', () => { const f = join(dir, 'pipe.json'); expect(spawnSync('mkfifo', [f]).status).toBe(0); expect(() => readStateText(f)).toThrow(); });
  it('refuses a file owned by another uid', () => expect(() => readStateText(file('o.json', '{}'), (process.getuid?.() ?? 0) + 1)).toThrow());
  it('refuses a missing file', () => expect(() => readStateText(join(dir, 'nope.json'))).toThrow());
  it('readStackUrls skips every file when the uid does not match', () => {
    const prev = process.env.QA_LOCAL_STATE_FILE;
    process.env.QA_LOCAL_STATE_FILE = file('s.json', JSON.stringify(record(process.pid)));
    try { expect(readStackUrls((process.getuid?.() ?? 0) + 1)).toEqual([]); } finally { if (prev === undefined) delete process.env.QA_LOCAL_STATE_FILE; else process.env.QA_LOCAL_STATE_FILE = prev; }
  });
});

describe('the state file is made and rewritten without following a link', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-state-test-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  it('creates a new file owner-only', () => {
    const f = join(dir, 'new.json'); createStateFile(f, '{"a":1}');
    expect(readFileSync(f, 'utf8')).toBe('{"a":1}');
    expect(spawnSync('stat', ['-c', '%a', f], { encoding: 'utf8' }).stdout.trim()).toBe('600');
  });
  it('refuses a link planted at the path and writes nothing through it', () => {
    const target = join(dir, 'target.txt'); const f = join(dir, 'link.json'); symlinkSync(target, f);
    expect(() => createStateFile(f, 'secret')).toThrow();
    expect(existsSync(target)).toBe(false);
  });
  it('refuses a file that is already there', () => { const f = join(dir, 'there.json'); writeFileSync(f, 'x'); expect(() => createStateFile(f, 'y')).toThrow(); expect(readFileSync(f, 'utf8')).toBe('x'); });
  it('rewrites a regular file, and refuses a link or another user\'s file', () => {
    const f = join(dir, 'rw.json'); createStateFile(f, 'a long first text'); updateStateFile(f, 'b');
    expect(readFileSync(f, 'utf8')).toBe('b');
    const target = join(dir, 't2.txt'); writeFileSync(target, 'keep'); const l = join(dir, 'l2.json'); symlinkSync(target, l);
    expect(() => updateStateFile(l, 'x')).toThrow(); expect(readFileSync(target, 'utf8')).toBe('keep');
    expect(() => updateStateFile(f, 'x', (process.getuid?.() ?? 0) + 1)).toThrow();
  });
});

describe('start and seed with a bad state file', () => {
  const script = fileURLToPath(new URL('./qa-local.mjs', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'qa-bad-state-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const bads: [string, (f: string) => void][] = [
    ['bad JSON', f => writeFileSync(f, '{not json')],
    ['a link', f => symlinkSync(join(dir, 'nowhere'), f)],
    ['a pipe', f => { expect(spawnSync('mkfifo', [f]).status).toBe(0); }],
  ];
  for (const cmd of [['start', '--no-build'], ['seed', 'x']]) {
    it.each(bads)(`${cmd[0]} refuses with one line and a non-zero exit on %s`, (name, make) => {
      const f = join(dir, `${cmd[0]}-${name.replace(/\W/g, '')}.json`); make(f);
      const r = spawnSync('npx', ['tsx', script, ...cmd], { encoding: 'utf8', timeout: 60000, env: { ...process.env, QA_LOCAL_STATE_FILE: f } });
      expect(r.status).toBe(2);
      expect(r.stderr.trim().split('\n')).toHaveLength(1);
      expect(r.stderr).toMatch(/^qa-local: refused: the state file .* cannot be used/);
    }, 70000);
  }
});
