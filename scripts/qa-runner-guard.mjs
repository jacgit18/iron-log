#!/usr/bin/env node
// PreToolUse hook of the QA Runner agent (agent file .claude/agents/qa-scenario-runner.md, frontmatter `hooks:`). The agent's tool list says which tools it has,
// not what they may be used for; this refuses the calls that go outside the local scratch stack and the evidence folder. Claude Code runs it before every
// Bash, Read, Grep, Glob, Write and browser call of that agent only; exit code 2 plus a reason on stderr refuses the call (any other exit code lets the call through, so the agent file runs it as `node ... || exit 2`). It fails closed: input or state it cannot read is refused.
// `javascript_tool` is not granted at all (a tool the agent does not have needs no pattern check): sign-in is a page `qa-local.mjs seed` writes into the stack, which the agent only navigates to.
// Not covered: clicks on in-app links (the `computer` tool), a symlink in the checkout or the evidence folder, which is not followed.
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evidenceRoot, originProblem, readStackUrl } from './qa-local.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // this checkout, whatever directory the hook is started from
const SCENARIO_ID = /^S-\d{1,4}$/;
const PERSONA_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const SHA = /^[0-9a-f]{4,40}$/;
const SECRET_NAME = /(^|[\\/])(\.env(?!\.example$)[^\\/]*|[^\\/]*\.pem|[^\\/]*\.key|id_rsa[^\\/]*|\.npmrc|\.git[\\/]config|credentials[^\\/]*|service-account[^\\/]*\.json)$/i;

/** Splits a command into words the way a shell would, or returns why it cannot be trusted: no expansion, no operator, no redirect, no glob outside quotes. */
export function words(cmd) {
  if (typeof cmd !== 'string' || !cmd.trim()) return { problem: 'an empty command' };
  const out = []; let cur = null; let quote = null;
  for (const ch of cmd) {
    if (ch === '$' || ch === '`' || ch === '\\' || ch === '\n' || ch === '\r' || ch === '\0') return { problem: `the character ${JSON.stringify(ch)} is not allowed (expansion, escape or a second command)` };
    if (quote) { if (ch === quote) quote = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur ??= ''; continue; }
    if (/\s/.test(ch)) { if (cur !== null) { out.push(cur); cur = null; } continue; }
    if (';&|<>(){}*?[]~!#'.includes(ch)) return { problem: `${ch} outside quotes is not allowed (operator, redirect, glob or expansion)` };
    cur = (cur ?? '') + ch;
  }
  if (quote) return { problem: 'an unclosed quote' };
  if (cur !== null) out.push(cur);
  return { words: out };
}

/** Whether `p` is inside the evidence folder (after resolving `..`), or the folder's own path. */
export function underEvidence(p, root = evidenceRoot()) {
  if (typeof p !== 'string' || !p || !isAbsolute(p)) return false;
  const r = resolve(p);
  return r === root || r.startsWith(root + sep);
}

/** Why a Bash command is refused, or null. Only the commands the agent file lists, with their arguments checked, as one simple command. */
export function bashProblem(cmd, root = evidenceRoot()) {
  const w = words(cmd);
  if (w.problem) return w.problem;
  const [a, b, c, ...rest] = w.words;
  const no = `Bash may only run: npx tsx scripts/qa-local.mjs (start|seed|check-url|status|stop), node scripts/qa-scenarios-doc.mjs --record, git rev-parse|status, mkdir -p under ${root}`;
  if (a === 'npx' && b === 'tsx' && c === 'scripts/qa-local.mjs') {
    const [sub, arg, ...more] = rest;
    if (sub === 'start' && (arg === undefined || arg === '--no-build') && !more.length) return null;
    if (sub === 'seed' && PERSONA_ID.test(arg ?? '') && !more.length) return null;
    if (sub === 'check-url' && arg !== undefined && !more.length) return null;
    if ((sub === 'status' || sub === 'stop') && arg === undefined) return null;
    return `qa-local.mjs: that subcommand or argument is not allowed. ${no}`;
  }
  if (a === 'node' && b === 'scripts/qa-scenarios-doc.mjs' && c === '--record') {
    const [id, outcome, ...opts] = rest;
    if (!SCENARIO_ID.test(id ?? '') || !['pass', 'fail', 'blocked'].includes(outcome)) return `--record needs <S-nn> pass|fail|blocked. ${no}`;
    let i = opts[0] !== undefined && !opts[0].startsWith('--') ? 1 : 0; // the optional note
    const seen = {};
    for (; i < opts.length; i += 2) {
      const [k, v] = [opts[i], opts[i + 1]];
      if (k === '--emulated' && !seen[k]) { seen[k] = true; i -= 1; continue; } // a flag with no value: the run was in an emulated phone view
      if (!['--by', '--build', '--results'].includes(k) || v === undefined || seen[k]) return `--record: only --by, --build, --results and --emulated, each once. ${no}`;
      seen[k] = v;
    }
    if (seen['--by'] !== 'claude') return '--record: --by must be claude';
    if (!SHA.test(seen['--build'] ?? '')) return '--record: --build must be a commit sha';
    if (!underEvidence(seen['--results'], root)) return `--record: --results must be a file under ${root}, never the owner's results file`;
    return null;
  }
  if (a === 'git' && b === 'rev-parse' && ((c === '--short' && rest[0] === 'HEAD' && rest.length === 1) || (c === 'HEAD' && !rest.length))) return null;
  if (a === 'git' && b === 'status' && (c === undefined || (c === '--short' && !rest.length))) return null;
  if (a === 'mkdir' && b === '-p' && c !== undefined && !rest.length && underEvidence(c, root)) return null;
  return `command not allowed. ${no}`;
}

/** Why a file path may not be read or written, or null. `write` limits it to the evidence folder; reads also allow this checkout, never a secret file. */
export function pathProblem(p, { write = false, root = evidenceRoot(), repo = REPO } = {}) {
  if (typeof p !== 'string' || !p) return 'no path given';
  const abs = isAbsolute(p) ? resolve(p) : resolve(repo, p);
  if (SECRET_NAME.test(abs)) return `${abs} looks like a secret or credentials file`;
  if (underEvidence(abs, root)) return null;
  if (write) return `writes are only allowed under ${root}`;
  const rr = resolve(repo);
  return abs === rr || abs.startsWith(rr + sep) ? null : `${abs} is outside this checkout and ${root}`;
}

/** The decision for one hook call: a reason to refuse it, or null. `stackUrl` is the running stack's address (null when none). */
export function decide({ tool_name: tool, tool_input }, { root = evidenceRoot(), stackUrl = null, repo = REPO } = {}) {
  const input = tool_input && typeof tool_input === 'object' ? tool_input : {};
  switch (tool) {
    case 'Bash': return bashProblem(input.command, root);
    case 'Write': return pathProblem(input.file_path, { write: true, root, repo });
    case 'Read': return pathProblem(input.file_path, { root, repo });
    case 'Grep': case 'Glob': {
      for (const v of [input.path, input.glob, input.pattern]) if (typeof v === 'string' && SECRET_NAME.test(v)) return `${v} names a secret or credentials file`;
      if (tool === 'Glob' && typeof input.pattern === 'string') {
        if (input.pattern.split(/[\\/]/).includes('..')) return 'a Glob pattern with .. is not allowed';
        const bad = isAbsolute(input.pattern) ? pathProblem(input.pattern.replace(/[*?[{].*$/, '') || '/', { root, repo }) : null;
        if (bad) return bad;
      }
      return input.path === undefined ? null : pathProblem(input.path, { root, repo });
    }
    case 'mcp__Claude_Browser__navigate': {
      return originProblem(input.url ?? '', stackUrl);
    }
    case 'mcp__Claude_Browser__javascript_tool': return 'javascript_tool is not a tool of the QA Runner: sign in by navigating to the page `seed` printed';
    case 'mcp__Claude_Browser__resize_window': { // the emulated phone view for a phone scenario, and back; no custom size, no other tab
      const keys = Object.keys(input);
      return keys.every(k => k === 'preset') && (input.preset === 'mobile' || input.preset === 'desktop') ? null : 'resize_window may only set preset mobile (the emulated phone view) or desktop (to put it back)';
    }
    case 'mcp__Claude_Browser__read_page': case 'mcp__Claude_Browser__find': case 'mcp__Claude_Browser__computer': case 'mcp__Claude_Browser__get_page_text': return null;
    default: return `${tool} is not a tool of the QA Runner`;
  }
}

async function main() {
  let call; let why;
  try { call = JSON.parse(await new Promise((ok, no) => { let s = ''; process.stdin.on('data', d => { s += d; }).on('end', () => ok(s)).on('error', no); })); } catch { call = null; }
  try { why = call && typeof call === 'object' ? decide(call, { stackUrl: readStackUrl() }) : 'the hook could not read its input'; } catch (e) { why = `the hook failed (${e.message})`; }
  if (why) { console.error(`qa-runner-guard: refused: ${why}`); process.exit(2); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
