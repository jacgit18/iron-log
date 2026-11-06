#!/usr/bin/env node
// Turns the QA smoke run's Playwright JSON report into a Markdown table for the Actions run summary (brief: qa-nightly-smoke).
//   node scripts/qa-smoke-summary.mjs test-results-qa/results.json [commit sha] >> "$GITHUB_STEP_SUMMARY"
// A scenario is a test whose title starts with its id ("S-32: ..."); its result is the last attempt, and a test that needed a retry is marked.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** One row per test in a Playwright JSON report: { id, title, outcome: 'pass' | 'fail' | 'flaky', retries }. */
export function rowsOf(report) {
  const rows = [];
  const walk = suite => {
    for (const spec of suite.specs ?? []) {
      const results = spec.tests.flatMap(t => t.results);
      const last = results.at(-1);
      const passed = last?.status === 'passed';
      rows.push({ id: spec.title.match(/^(S-\d+)\b/)?.[1] ?? '', title: spec.title, outcome: passed ? (results.length > 1 ? 'flaky' : 'pass') : 'fail', retries: Math.max(0, results.length - 1) });
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return rows;
}

/** The summary text: the commit, a line of counts, and one row per scenario. */
export function summaryOf(rows, sha = '') {
  const count = o => rows.filter(r => r.outcome === o).length;
  const lines = [`### QA scenario smoke run${sha ? ` (${sha.slice(0, 8)})` : ''}`, '', `${count('pass')} passed, ${count('flaky')} passed after a retry, ${count('fail')} failed of ${rows.length}.`, '', '| Scenario | Result | Retries |', '|---|---|---|'];
  for (const r of rows) lines.push(`| ${r.id || r.title} | ${r.outcome} | ${r.retries} |`);
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('usage: qa-smoke-summary.mjs <results.json> [sha]'); process.exit(2); }
  process.stdout.write(summaryOf(rowsOf(JSON.parse(readFileSync(file, 'utf8'))), process.argv[3] ?? ''));
}
