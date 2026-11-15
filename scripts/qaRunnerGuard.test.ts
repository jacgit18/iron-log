// The allow/deny decision of scripts/qa-runner-guard.mjs, the PreToolUse hook that keeps the QA Runner agent inside the local stack and the evidence folder.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
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
  const state = (text: string) => { const f = join(dir, `state-${Math.random().toString(36).slice(2)}.json`); writeFileSync(f, text); return f; };
  // Started from another directory with a fake state file, as Claude Code starts it from wherever the session is.
  const run = (input: string, stateFile = state(JSON.stringify({ url: stackUrl }))) => spawnSync('node', [script], { input, encoding: 'utf8', cwd: tmpdir(), env: { ...process.env, QA_LOCAL_STATE_FILE: stateFile } });
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
