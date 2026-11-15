import { describe, expect, it } from 'vitest';
import { buildReport } from './lib/qaReport.mjs';
import { renderReport, standalone } from './lib/qaReportHtml.mjs';
import { SCENARIOS } from '../server/qa/scenarios';
import { automationOf } from '../server/qa/scenarioAutomation';

// Small made-up scenarios so each rule is checked on its own; one last test runs the real list.
const sc = (id: string, feature: string, extra: Record<string, unknown> = {}) => ({ id, feature, title: `t ${id}`, persona: 'p', brief: 'b', steps: [], expected: [], ...extra });
const list = [sc('S-01', 'Alpha'), sc('S-02', 'Alpha'), sc('S-10', 'Beta', { device: true }), sc('S-11', 'Beta', { retired: true }), sc('S-03', 'Beta')];
const auto = (id: string) => (id === 'S-01' ? { auto: 'e2e' as const } : undefined);
const entry = (id: string, outcome: string, date: string, by: string, note = '') => ({ id, outcome, date, by, note });

describe('buildReport', () => {
  it('with no results every live scenario is not run, grouped by feature, and nothing is invented', () => {
    const r = buildReport(list, auto, []);
    expect(r.totals).toEqual({ scenarios: 4, pass: 0, fail: 0, blocked: 0, notRun: 4 });
    expect(r.attention).toEqual([]);
    expect(r.proposed).toEqual([]);
    expect(r.confirmed).toEqual([]);
    expect(r.lastDate).toBeNull();
    expect(r.awaitingSpotCheck).toBe(0);
    expect(r.notRun.map(g => g.feature)).toEqual(['Alpha', 'Beta']);
    expect(r.notRun[1].rows.map(x => x.id)).toEqual(['S-03', 'S-10']); // id order, numeric
    expect(r.notRun[0].rows[0].auto).toBe('e2e');
    expect(r.notRun[0].rows[1].auto).toBe('untagged');
  });

  it('a later fail beats an older pass for the same id, and a later pass beats an older fail', () => {
    const r = buildReport(list, auto, [entry('S-01', 'pass', '2026-11-01', 'owner'), entry('S-01', 'fail', '2026-11-05', 'claude', 'broke'), entry('S-02', 'fail', '2026-11-01', 'claude'), entry('S-02', 'pass', '2026-11-06', 'claude')]);
    expect(r.totals.fail).toBe(1);
    expect(r.attention.map(x => x.id)).toEqual(['S-01']);
    expect(r.attention[0].note).toBe('broke');
    expect(r.proposed.map(x => x.id)).toEqual(['S-02']);
    expect(r.confirmed).toEqual([]);
  });

  it('leaves retired scenarios out of every count and list, and ignores a result for one', () => {
    const r = buildReport(list, auto, [entry('S-11', 'pass', '2026-11-02', 'owner')]);
    expect(r.totals.scenarios).toBe(4);
    expect(r.confirmed).toEqual([]);
    expect(r.lastDate).toBeNull();
    expect(r.notRun.flatMap(g => g.rows).some(x => x.id === 'S-11')).toBe(false);
  });

  it('never counts a device scenario as runnable by the agent', () => {
    const r = buildReport(list, auto, []);
    const dev = r.notRun.flatMap(g => g.rows).find(x => x.id === 'S-10');
    expect(dev?.device).toBe(true);
    expect(dev?.agentRunnable).toBe(false);
    expect(r.agentRunnableNotRun).toBe(3);
    expect(r.device).toEqual({ total: 1, notTried: 1, ownerRecorded: 0 });
  });

  it('keeps proposals (by claude) apart from owner-confirmed results, and counts those awaiting a spot-check', () => {
    const r = buildReport(list, auto, [entry('S-01', 'pass', '2026-11-03', 'claude'), entry('S-02', 'pass', '2026-11-04', 'owner'), entry('S-03', 'blocked', '2026-11-05', 'claude', 'no data'), entry('S-10', 'pass', '2026-11-06', 'owner')]);
    expect(r.proposed.map(x => x.id)).toEqual(['S-01']);
    expect(r.proposed[0].proposed).toBe(true);
    expect(r.confirmed.map(x => x.id)).toEqual(['S-10', 'S-02']); // newest first
    expect(r.attention.map(x => x.id)).toEqual(['S-03']);
    expect(r.attention[0].proposed).toBe(true);
    expect(r.awaitingSpotCheck).toBe(2); // the claude pass and the claude blocked
    expect(r.totals).toEqual({ scenarios: 4, pass: 3, fail: 0, blocked: 1, notRun: 0 });
    expect(r.device).toEqual({ total: 1, notTried: 0, ownerRecorded: 1 });
    expect(r.lastDate).toBe('2026-11-06');
  });

  it('orders attention with fail before blocked, then newest first', () => {
    const many = [sc('S-01', 'A'), sc('S-02', 'A'), sc('S-03', 'A')];
    const r = buildReport(many, () => undefined, [entry('S-01', 'blocked', '2026-11-09', 'owner'), entry('S-02', 'fail', '2026-11-01', 'owner'), entry('S-03', 'fail', '2026-11-07', 'owner')]);
    expect(r.attention.map(x => x.id)).toEqual(['S-03', 'S-02', 'S-01']);
  });

  it('runs on the real scenario list: every live scenario lands in exactly one place', () => {
    const r = buildReport(SCENARIOS as never, automationOf as never, []);
    const live = SCENARIOS.filter(s => !s.retired).length;
    expect(r.totals.scenarios).toBe(live);
    expect(r.totals.notRun).toBe(live);
    expect(r.device.total).toBe(SCENARIOS.filter(s => !s.retired && s.device).length);
  });

  it('redacts an email quoted in a note, plain or masked', () => {
    const r = buildReport(list, auto, [entry('S-01', 'pass', '2026-11-03', 'claude', 'Signed in as diet-on-target@qa.invalid and saw n***@qa.invalid on row 3')]);
    expect(r.proposed[0].note).toBe('Signed in as [email] and saw [email] on row 3');
  });

  it('redacts an email in a scenario title too', () => {
    const r = buildReport([sc('S-01', 'Alpha', { title: 'Sign in as a@b.invalid' })], () => undefined, []);
    expect(r.notRun[0].rows[0].title).toBe('Sign in as [email]');
  });

  it('puts no persona email in the data', () => {
    const r = buildReport(SCENARIOS as never, automationOf as never, []);
    expect(JSON.stringify(r)).not.toMatch(/@|\.invalid/);
  });
});

describe('renderReport', () => {
  const html = (results: ReturnType<typeof entry>[]) => renderReport(buildReport(list, auto, results), { generatedOn: '2026-11-14', source: 'qa-results.json' });

  it('escapes note and title text so a result cannot inject markup', () => {
    const out = renderReport(buildReport([sc('S-01', 'A', { title: 'x <b>y</b>' })], () => undefined, [entry('S-01', 'fail', '2026-11-03', 'claude', '<script>alert(1)</script> & more')]));
    expect(out).not.toContain('<script>alert(1)');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; more');
    expect(out).toContain('x &lt;b&gt;y&lt;/b&gt;');
  });

  it('with no results says so, and every section shows its empty state', () => {
    const out = html([]);
    expect(out).toContain('No result is recorded yet');
    expect(out).toContain('Nothing is failing or blocked.');
    expect(out).toContain('No agent pass is waiting for a spot-check.');
    expect(out).toContain('You have not recorded a pass yet.');
  });

  it('labels an agent pass as proposed and an owner pass as confirmed', () => {
    const out = html([entry('S-01', 'pass', '2026-11-03', 'claude'), entry('S-02', 'pass', '2026-11-04', 'owner')]);
    expect(out).toContain('data-kind="proposed"');
    expect(out).toContain('data-kind="confirmed"');
    expect(out).toContain('agent result, awaiting your spot-check');
  });

  it('is an Artifact body (no doctype) and standalone() adds one', () => {
    expect(html([])).not.toMatch(/<!doctype/i);
    expect(standalone(html([]))).toMatch(/^<!doctype html>/i);
    expect(html([])).toContain('<title>QA results</title>');
  });
});
