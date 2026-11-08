import { describe, expect, it } from 'vitest';
import { rowsOf, summaryOf } from './qa-smoke-summary.mjs';

const spec = (title, ...statuses) => ({ title, tests: [{ results: statuses.map(status => ({ status })) }] });
const report = { suites: [{ suites: [{ specs: [spec('S-01: a', 'passed'), spec('S-32: b', 'failed', 'passed')] }], specs: [spec('S-37: c', 'failed', 'failed'), spec('not a scenario', 'passed')] }] };

describe('QA smoke summary', () => {
  it('reads each test as pass, flaky (needed a retry) or fail, from its last attempt', () => {
    expect(rowsOf(report).map(r => [r.id, r.outcome, r.retries])).toEqual([['S-37', 'fail', 1], ['', 'pass', 0], ['S-01', 'pass', 0], ['S-32', 'flaky', 1]]);
  });
  it('says the counts and lists every scenario, with the short commit', () => {
    const text = summaryOf(rowsOf(report), 'abcdef0123456789');
    expect(text).toContain('(abcdef01)');
    expect(text).toContain('2 passed, 1 passed after a retry, 1 failed of 4.');
    expect(text).toContain('| S-37 | fail | 1 |');
    expect(text).toContain('| not a scenario | pass | 0 |');
  });
  it('handles an empty report', () => expect(summaryOf(rowsOf({}))).toContain('0 passed, 0 passed after a retry, 0 failed of 0.'));
});
