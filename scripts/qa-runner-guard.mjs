#!/usr/bin/env node
// PreToolUse hook of the QA Runner agent (agent file .claude/agents/qa-scenario-runner.md, frontmatter `hooks:`). The agent's tool list says which tools it has,
// not what they may be used for; this refuses the calls that go outside the local scratch stack and the evidence folder. Claude Code runs it before every
// Bash, Read, Grep, Glob, Write and browser call of that agent only; exit code 2 plus a reason on stderr refuses the call (any other exit code lets the call through, so the agent file runs it as `node ... || exit 2`). It fails closed: input or state it cannot read is refused.
// Not covered (best effort): `javascript_tool` code is checked by pattern, so a string built at run time can slip past; a symlink inside the evidence folder is not followed.
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { originProblem, readStackUrl } from './qa-local.mjs';

export const evidenceRoot = () => join(tmpdir(), 'qa-runs');
const SCENARIO_ID = /^S-\d{1,4}$/;
const PERSONA_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const SHA = /^[0-9a-f]{4,40}$/;
const SECRET_NAME = /(^|[\\/])(\.env[^\\/]*|[^\\/]*\.pem|[^\\/]*\.key|id_rsa[^\\/]*|\.npmrc|\.git[\\/]config|credentials[^\\/]*|service-account[^\\/]*\.json)$/i;

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
      if (!['--by', '--build', '--results'].includes(k) || v === undefined || seen[k]) return `--record: only --by, --build and --results, each once. ${no}`;
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
export function pathProblem(p, { write = false, root = evidenceRoot(), repo = process.cwd() } = {}) {
  if (typeof p !== 'string' || !p) return 'no path given';
  const abs = isAbsolute(p) ? resolve(p) : resolve(repo, p);
  if (SECRET_NAME.test(abs)) return `${abs} looks like a secret or credentials file`;
  if (underEvidence(abs, root)) return null;
  if (write) return `writes are only allowed under ${root}`;
  const rr = resolve(repo);
  return abs === rr || abs.startsWith(rr + sep) ? null : `${abs} is outside this checkout and ${root}`;
}

/** Why page code run in the browser is refused, or null. Best effort by pattern: no absolute or scheme-relative URL, no navigation, no non-relative fetch, no dynamic code. */
export function scriptProblem(code) {
  if (typeof code !== 'string') return 'no code given';
  if (/(https?|wss?|ftp|file|data|blob):/i.test(code) || /(^|[^:\w])\/\/[\w[.-]+/.test(code.replace(/\/\/[^\n]*$/gm, ''))) return 'an absolute URL in page code is not allowed: only paths on the stack';
  if (/\b(window\.open|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|Worker|eval|Function|import)\s*\(|\bnew\s+(Worker|WebSocket|Function)\b/.test(code)) return 'that API can reach another origin or run built code';
  if (/\b(location|href|top|parent)\s*(\.\s*(href|assign|replace|pathname|search)\s*)?=(?!=)|\blocation\s*\.\s*(assign|replace)\s*\(/.test(code)) return 'navigating from page code is not allowed: use navigate';
  for (const m of code.matchAll(/\bfetch\s*\(\s*([^,)]*)/g)) if (!/^(['"`])\/(?!\/)[^'"`$\\\\\n\r\t]*\1$/.test(m[1].trim())) return 'fetch may only take a literal path on the stack, such as "/api/auth/sign-in/email"';
  return null;
}

/** The decision for one hook call: a reason to refuse it, or null. `stackUrl` is the running stack's address (null when none). */
export function decide({ tool_name: tool, tool_input }, { root = evidenceRoot(), stackUrl = null, repo = process.cwd() } = {}) {
  const input = tool_input && typeof tool_input === 'object' ? tool_input : {};
  switch (tool) {
    case 'Bash': return bashProblem(input.command, root);
    case 'Write': return pathProblem(input.file_path, { write: true, root, repo });
    case 'Read': return pathProblem(input.file_path, { root, repo });
    case 'Grep': case 'Glob': {
      for (const v of [input.path, input.glob, input.pattern]) if (typeof v === 'string' && SECRET_NAME.test(v)) return `${v} names a secret or credentials file`;
      if (tool === 'Glob' && typeof input.pattern === 'string' && (isAbsolute(input.pattern) || input.pattern.split(/[\\/]/).includes('..'))) return pathProblem(input.pattern.replace(/[*?[{].*$/, ''), { root, repo }) ?? (input.pattern.includes('..') ? 'a Glob pattern with .. is not allowed' : null);
      return input.path === undefined ? null : pathProblem(input.path, { root, repo });
    }
    case 'mcp__Claude_Browser__navigate': {
      if (input.url === 'back' || input.url === 'forward') return null;
      return originProblem(input.url ?? '', stackUrl);
    }
    case 'mcp__Claude_Browser__javascript_tool': return scriptProblem(input.text);
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
