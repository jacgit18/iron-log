#!/usr/bin/env node
// Writes the QA results page (brief: qa-reporter-page) as one self-contained HTML file. Read-only: it never edits a result or a scenario.
//   npx tsx scripts/qa-report.mjs --results "<project docs>/ops/qa-results.json" --out <file.html> [--standalone] [--activity <file>]
// `--results` is the file `qa-scenarios-doc.mjs --record` writes; without it the page shows every scenario as not run. `--out` is required (there is no default
// place); the page is a generated file, so give a path outside the repository and never commit it. The default output is an Artifact page body (no <!doctype>; the Artifact tool wraps it); `--standalone`
// wraps it so the file opens straight in a browser. Reading and validating the results reuses `allResults` (every entry, emulated ones included) from qa-scenarios-doc.mjs, and the
// counting is `buildReport` (scripts/lib/qaReport.mjs); this file only loads the real data and writes the output.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { automationOf } from '../server/qa/scenarioAutomation.ts';
import { SCENARIOS } from '../server/qa/scenarios.ts';
import { allResults } from './qa-scenarios-doc.mjs';
import { activityFile } from './qa-agent-activity.mjs';
import { summarizeActivity } from './lib/qaActivity.mjs';
import { buildReport, buildSmokeBlock } from './lib/qaReport.mjs';
import { renderReport, standalone } from './lib/qaReportHtml.mjs';

/** The last smoke runs from GitHub (read-only). Null when `gh` is missing, not signed in, slow or answers something that is not a list: the page then says so. */
function smokeRows() {
  try {
    const text = execFileSync('gh', ['run', 'list', '--workflow', 'qa-smoke.yml', '--json', 'conclusion,status,createdAt,headSha,url', '--limit', '7'], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] });
    const rows = JSON.parse(text);
    return Array.isArray(rows) ? rows : null;
  } catch { return null; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : (process.argv[i + 1] ?? ''); };
  const fail = msg => { console.error(`qa-report: ${msg}`); process.exit(2); };
  const out = arg('--out');
  const file = arg('--results');
  if (!out) fail('usage: qa-report.mjs --results "<qa-results.json>" --out <file.html> [--standalone]');
  if (process.argv.includes('--results') && (!file || file.startsWith('--'))) fail('--results needs the path of the results file (an empty value would show every scenario as not run).');
  if (file && !existsSync(file)) fail(`${file} does not exist. Record a run first, or leave out --results to see every scenario as not run.`);
  let entries = [];
  try { entries = allResults(file ? readFileSync(file, 'utf8') : ''); } catch (e) { fail(e.message); }
  let activity = null; // the SubagentStart/Stop hook's file (--activity overrides the default); no file means no record, not "never run"
  try { activity = summarizeActivity(readFileSync(arg('--activity') || activityFile(), 'utf8')); } catch { /* not recorded */ }
  const today = new Date().toISOString().slice(0, 10); // UTC, like the date `--record` stamps on a result
  const report = buildReport(SCENARIOS, automationOf, entries, { today, activity });
  const smoke = buildSmokeBlock(smokeRows(), new Date());
  const body = renderReport(report, { generatedOn: today, source: file ? basename(file) : undefined, smoke });
  writeFileSync(`${out}.tmp`, process.argv.includes('--standalone') ? standalone(body) : body);
  renameSync(`${out}.tmp`, out);
  const t = report.totals;
  console.error(`qa-report: wrote ${out}: ${t.scenarios} live scenarios, ${t.pass} pass (${report.proposed.length} proposed, ${report.confirmed.length} confirmed), ${t.fail} fail, ${t.blocked} blocked, ${t.notRun} not run.`);
  console.error(smoke.available && smoke.last ? `qa-report: nightly smoke (CI evidence): last run ${smoke.last.at} ${smoke.last.result}; last ${smoke.windowDays} days ${smoke.runs} runs, ${smoke.passed} passed, ${smoke.failed} failed; ${smoke.last.url ?? 'no link'}` : 'qa-report: nightly smoke (CI evidence): smoke status not available.');
}
