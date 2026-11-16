// Visible use of the QA agents (brief: qa-agent-activity-log). Pure line builders and readers plus one small append helper; the scripts that call them
// are qa-runner-guard.mjs (one line per call), qa-agent-activity.mjs (SubagentStart/SubagentStop) and qa-keeper-reminder.mjs (after `gh pr create`).
// No line holds command text, a URL or a secret: only a time, a tool or agent name, an outcome and a short reason with addresses removed.
import { closeSync, constants, fstatSync, ftruncateSync, openSync, readFileSync, writeSync } from 'node:fs';

export const AGENTS = ['qa-scenario-keeper', 'qa-scenario-runner', 'qa-results-reporter'];
export const LOG_MAX_BYTES = 64 * 1024;

const SAFE_NAME = /^[A-Za-z0-9_.-]{1,80}$/;
/**
 * The log never holds what the agent chose (a path, a search pattern, an address, a command): a refusal is logged as one fixed code picked from the guard's reason.
 * Order matters: the first matching rule wins; anything unknown is `other`.
 */
const REASON_CODES = [
  [/secret or credentials file|names a secret/, 'secret-file'],
  [/could not read its input|hook failed/, 'hook-input'],
  [/javascript_tool/, 'javascript-tool'],
  [/resize_window/, 'resize-window'],
  [/is not a tool of the QA Runner/, 'tool-not-allowed'],
  [/Glob pattern with \.\./, 'glob-dotdot'],
  [/outside this checkout|writes are only allowed/, 'path-outside'],
  [/live stack|plain http|origin|address|port|host/i, 'address'],
  [/--record|--by|--build|--results|--emulated/, 'record-args'],
  [/not allowed \(|is not allowed|an empty command|unclosed quote/, 'shell-syntax'],
  [/qa-local\.mjs|command not allowed|Bash may only/, 'bash-command'],
];
export const reasonCode = text => (REASON_CODES.find(([re]) => re.test(String(text ?? '')))?.[1] ?? 'other');

/** `2026-11-16T10:00:00.000Z Bash refused <code>` or `... allowed`. `why` is the guard's refusal reason, or null; only its code is written. */
export function guardLogLine(now, tool, why) {
  const name = SAFE_NAME.test(String(tool)) ? tool : 'unknown';
  return `${now.toISOString()} ${name} ${why ? `refused ${reasonCode(why)}` : 'allowed'}`;
}

/** Appends a line to `path`: owner-only (mode 600), never through a link, and past `max` bytes the older half is dropped. Throws on failure; callers that must not fail catch it. Two processes trimming at the cap at once can duplicate or lose lines: the log is for counts and is never read to make a decision. */
export function appendCapped(path, line, { max = LOG_MAX_BYTES, mode = 0o600 } = {}) {
  const fd = openSync(path, constants.O_RDWR | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, mode);
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.uid !== process.getuid?.()) throw new Error('not a regular file of this user');
    if (st.size + line.length + 1 > max) {
      const text = readFileSync(fd, 'utf8'); // O_APPEND does not stop reads; position 0 for a fresh descriptor
      const lines = text.split('\n').filter(Boolean);
      const keep = lines.slice(Math.floor(lines.length / 2)).join('\n');
      ftruncateSync(fd, 0);
      writeSync(fd, keep ? `${keep}\n` : '');
    }
    writeSync(fd, `${line}\n`);
  } finally { closeSync(fd); }
}

const GUARD_LINE = /^(\d{4}-\d\d-\d\dT[\d:.]+Z) (\S+) (allowed|refused)(?: (.*))?$/;
/** Counts from the guard log text. A log with no calls means the hook was not live (or the run never reached a tool). */
export function summarizeGuardLog(text) {
  const rows = String(text ?? '').split('\n').map(l => GUARD_LINE.exec(l)).filter(Boolean);
  const refused = rows.filter(m => m[3] === 'refused');
  return { calls: rows.length, refused: refused.length, first: rows[0]?.[1] ?? null, last: rows.at(-1)?.[1] ?? null, lastRefusal: refused.at(-1) ? `${refused.at(-1)[2]}: ${refused.at(-1)[4] ?? ''}` : null };
}

/** The sentence `hook-log` prints. */
export function describeGuardLog(s) {
  if (!s.calls) return 'hook log: no calls recorded. If a Runner run happened since the log was last cleared, the hook was not live.';
  return `hook log: ${s.calls} calls, ${s.refused} refused, first ${s.first}, last ${s.last}${s.lastRefusal ? `; last refusal: ${s.lastRefusal}` : ''}`;
}

/** `2026-11-16T10:00:00.000Z start qa-scenario-runner`, or null when this is not one of the three QA agents or the event is not a start or stop. */
export function agentLine(now, payload) {
  const ev = payload?.hook_event_name === 'SubagentStart' ? 'start' : payload?.hook_event_name === 'SubagentStop' ? 'stop' : null;
  const type = payload?.agent_type;
  return ev && AGENTS.includes(type) ? `${now.toISOString()} ${ev} ${type}` : null;
}

const AGENT_LINE = /^(\d{4}-\d\d-\d\dT[\d:.]+Z) (start|stop) (qa-[a-z-]+)$/;
/** Per agent: how many starts and stops, and the last of each. `null` when there is no activity file at all (not recorded, which is not the same as never run). */
export function summarizeActivity(text) {
  if (text == null) return null;
  const out = Object.fromEntries(AGENTS.map(a => [a, { starts: 0, stops: 0, lastStart: null, lastStop: null }]));
  for (const l of String(text).split('\n')) {
    const m = AGENT_LINE.exec(l);
    if (!m || !out[m[3]]) continue;
    const a = out[m[3]];
    if (m[2] === 'start') { a.starts += 1; a.lastStart = m[1]; } else { a.stops += 1; a.lastStop = m[1]; }
  }
  return out;
}

/** The directory `gh pr create` runs in: a leading `cd <dir> &&` (or `;`) in the command, resolved against the session's cwd, else the session's cwd. */
export function commandCwd(command, cwd, resolvePath) {
  const m = /^\s*cd\s+(?:"([^"$`]*)"|'([^']*)'|([^\s;&|$`"']+))\s*(?:&&|;)/.exec(String(command ?? ''));
  const dir = m ? (m[1] ?? m[2] ?? m[3]) : null;
  return dir ? resolvePath(cwd, dir) : cwd;
}
/** Whether a Bash tool result shows the PR was created: gh prints the new pull request's address. A failed create prints an error and no address. */
export function createdPr(response) {
  const text = typeof response === 'string' ? response : `${response?.stdout ?? ''}\n${response?.stderr ?? ''}`;
  return /github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/.test(text);
}
const PR_CREATE = /(^|[;&|(])\s*(cd [^;&|]*(&&|;)\s*)?gh pr create/;
const FEATURE_CODE = /^(src|server)\/(?!qa\/).*\.(ts|tsx|css)$/;
const isTest = f => /\.test\.|(^|\/)test\//.test(f);
/** The advisory text after `gh pr create`, or null. `files` are the files the branch changes against main. Never blocks. */
export function keeperReminder(command, files) {
  if (typeof command !== 'string' || !PR_CREATE.test(command)) return null;
  if (!files.some(f => FEATURE_CODE.test(f) && !isTest(f))) return null;
  const scenarios = files.some(f => f.startsWith('server/qa/scenarios/'));
  return scenarios
    ? 'QA reminder: this PR changes app code and touches QA scenarios. If it is a user-facing feature and the qa-scenario-keeper has not run in mode (b) on the diff, run it (CLAUDE.md, "QA scenarios kept by the Keeper agent"), then check the --qa ids in the PR body.'
    : 'QA reminder: this PR changes app code and no QA scenario. If it is a user-facing feature, run the qa-scenario-keeper in mode (b) on the diff (CLAUDE.md, "QA scenarios kept by the Keeper agent") and put the scenario ids in the PR with --qa; if it is not user-facing, the PR body says --qa "n/a: <why>".';
}
