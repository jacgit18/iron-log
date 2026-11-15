// The allow/deny decision of scripts/qa-runner-guard.mjs, the PreToolUse hook that keeps the QA Runner agent inside the local stack and the evidence folder.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { liveStackUrl, originProblem, readStackUrls, stackServerProblem, stateFileOk } from './qa-local.mjs';
import { bashProblem, decide, pathProblem, underEvidence, words } from './qa-runner-guard.mjs';

const root = '/tmp/qa-runs';
const stackUrl = 'http://127.0.0.1:41234';
const ok = (cmd: string) => expect(bashProblem(cmd, root)).toBeNull();
const no = (cmd: string) => expect(bashProblem(cmd, root)).not.toBeNull();

describe('bashProblem', () => {
  it.each([
    'npx tsx scripts/qa-local.mjs start', 'npx tsx scripts/qa-local.mjs start --no-build', 'npx tsx scripts/qa-local.mjs seed qa-new', 'npx tsx scripts/qa-local.mjs status',
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
  const server = spawn('node', ['-e', 'setTimeout(()=>{},60000)', 'server/index.ts'], { stdio: 'ignore', cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, PORT: '41234' } });
  afterAll(() => { server.kill(); });
  const state = (text: string) => { const f = join(dir, `state-${Math.random().toString(36).slice(2)}.json`); writeFileSync(f, text); return f; };
  // Started from another directory with a fake state file, as Claude Code starts it from wherever the session is.
  const run = (input: string, stateFile = state(JSON.stringify({ url: stackUrl, port: 41234, pid: server.pid }))) => spawnSync('node', [script], { input, encoding: 'utf8', cwd: tmpdir(), env: { ...process.env, QA_LOCAL_STATE_FILE: stateFile } });
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
  it('is refused on a reserved port (dev server, e2e, Postgres)', () => expect(liveStackUrl({ url: 'http://127.0.0.1:5433', port: 5433, pid: 4242 }, alive)).toBeNull());
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
    const server = spawn('node', ['-e', 'setTimeout(()=>{},60000)', 'server/index.ts'], { stdio: 'ignore', cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, PORT: '41234' } });
    const prev = process.env.TMPDIR; const prevState = process.env.QA_LOCAL_STATE_FILE;
    try {
      process.env.TMPDIR = d; delete process.env.QA_LOCAL_STATE_FILE;
      writeFileSync(join(d, 'qa-local-aaaaaaaaaa.json'), JSON.stringify({ url: stackUrl, port: 41234, pid: server.pid }));
      writeFileSync(join(d, 'qa-local-bbbbbbbbbb.json'), JSON.stringify({ url: 'http://127.0.0.1:41235', port: 41235, pid: 2 ** 22 + 12345 }));
      writeFileSync(join(d, 'other.json'), JSON.stringify({ url: 'http://127.0.0.1:41236', port: 41236, pid: process.pid }));
      expect(readStackUrls()).toEqual([stackUrl]); // the live one from the 'other checkout' only: not the dead pid, not a file with another name
    } finally { server.kill(); if (prev === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = prev; if (prevState !== undefined) process.env.QA_LOCAL_STATE_FILE = prevState; rmSync(d, { recursive: true, force: true }); }
  });
});

describe('what counts as a live stack server', () => {
  const cmd = 'npx tsx server/index.ts';
  const ok = { cmdline: cmd, cwd: '/work/wt', environ: 'A=1\0PORT=41234\0' };
  const checkout = (d: string) => d === '/work/wt';
  it('accepts the stack server of any checkout', () => expect(stackServerProblem(ok, 41234, checkout)).toBeNull());
  it('refuses a live process that is not server/index.ts', () => expect(stackServerProblem({ ...ok, cmdline: 'node other.js' }, 41234, checkout)).not.toBeNull());
  it('refuses a server with a different PORT', () => expect(stackServerProblem({ ...ok, environ: 'PORT=5173\0' }, 41234, checkout)).not.toBeNull());
  it('refuses a server whose folder is not a checkout', () => expect(stackServerProblem({ ...ok, cwd: '/elsewhere' }, 41234, checkout)).not.toBeNull());
  it('fails closed when a reading is missing (unreadable /proc)', () => {
    for (const bad of [{ ...ok, environ: null }, { ...ok, cwd: null }, { ...ok, cmdline: null }]) expect(stackServerProblem(bad as never, 41234, checkout)).not.toBeNull();
  });
  it('refuses a pid that is alive but not a stack (this test process) and a pid that is gone', () => {
    const rec = { url: stackUrl, port: 41234 };
    expect(liveStackUrl({ ...rec, pid: process.pid })).toBeNull();
    expect(liveStackUrl({ ...rec, pid: 2 ** 22 + 12345 })).toBeNull();
  });
  it('treats a non-true answer from the liveness check as not live', () => expect(liveStackUrl({ url: stackUrl, port: 41234, pid: 4242 }, (() => 'yes') as never)).toBeNull());
});

describe('which state files are read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-guard-files-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const file = (name: string, text: string) => { const f = join(dir, name); writeFileSync(f, text); return f; };
  it('reads a small regular file of this user', () => expect(stateFileOk(file('a.json', '{}'))).toBe(true));
  it('ignores an oversize file', () => expect(stateFileOk(file('big.json', ' '.repeat(5000)))).toBe(false));
  it('ignores a directory (not a regular file)', () => expect(stateFileOk(dir)).toBe(false));
  it('ignores a pipe', () => { const f = join(dir, 'pipe.json'); expect(spawnSync('mkfifo', [f]).status).toBe(0); expect(stateFileOk(f)).toBe(false); });
  it('ignores a file owned by another uid', () => expect(stateFileOk(file('o.json', '{}'), undefined, (process.getuid?.() ?? 0) + 1)).toBe(false));
  it('ignores a missing file', () => expect(stateFileOk(join(dir, 'nope.json'))).toBe(false));
  it('readStackUrls skips every file when the uid does not match', () => {
    const prev = process.env.QA_LOCAL_STATE_FILE;
    process.env.QA_LOCAL_STATE_FILE = file('s.json', JSON.stringify({ url: stackUrl, port: 41234, pid: process.pid }));
    try { expect(readStackUrls((process.getuid?.() ?? 0) + 1)).toEqual([]); } finally { if (prev === undefined) delete process.env.QA_LOCAL_STATE_FILE; else process.env.QA_LOCAL_STATE_FILE = prev; }
  });
});
