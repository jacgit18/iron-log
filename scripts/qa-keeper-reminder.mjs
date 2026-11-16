#!/usr/bin/env node
// PostToolUse hook for Bash (project .claude/settings.json; brief qa-agent-activity-log): after `gh pr create` on a branch that changes app code, reminds the
// session to run the QA Keeper (CLAUDE.md, "QA scenarios kept by the Keeper agent"). Advisory: exit 0 always, the text goes into the session as added context.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { keeperReminder } from './lib/qaActivity.mjs';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const payload = JSON.parse(await new Promise((ok, no) => { let s = ''; process.stdin.on('data', d => { s += d; }).on('end', () => ok(s)).on('error', no); }));
    const command = payload?.tool_input?.command;
    if (typeof command === 'string' && /gh pr create/.test(command)) {
      const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd();
      const files = execFileSync('git', ['diff', '--name-only', 'origin/main...HEAD'], { cwd, encoding: 'utf8', timeout: 10000 }).split('\n').filter(Boolean);
      const text = keeperReminder(command, files);
      if (text) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } }));
    }
  } catch { /* best effort */ }
}
