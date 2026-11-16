#!/usr/bin/env node
// SubagentStart / SubagentStop hook (project .claude/settings.json; brief qa-agent-activity-log): appends one line per Keeper, Runner or Reporter start and stop
// to the activity file the QA results page reads. Other agents are ignored. Best effort: it always exits 0 and never blocks an agent.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentLine, appendCapped } from './lib/qaActivity.mjs';

/** One file for every checkout of this user (an agent can run from any worktree); QA_AGENT_ACTIVITY_FILE overrides it. */
export const activityFile = () => process.env.QA_AGENT_ACTIVITY_FILE ?? join(tmpdir(), 'qa-agent-activity.log');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const payload = JSON.parse(await new Promise((ok, no) => { let s = ''; process.stdin.on('data', d => { s += d; }).on('end', () => ok(s)).on('error', no); }));
    const line = agentLine(new Date(), payload);
    if (line) appendCapped(activityFile(), line);
  } catch { /* best effort */ }
}
