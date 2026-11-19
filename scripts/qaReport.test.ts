import { describe, expect, it } from 'vitest';
import { buildReport, buildSmokeBlock } from './lib/qaReport.mjs';
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
    expect(r.device).toEqual({ total: 1, notTried: 1, emulated: 0, ownerRecorded: 0 });
  });

  it('keeps proposals (by claude) apart from owner-confirmed results, and counts those awaiting a spot-check', () => {
    const r = buildReport(list, auto, [entry('S-01', 'pass', '2026-11-03', 'claude'), entry('S-02', 'pass', '2026-11-04', 'owner'), entry('S-03', 'blocked', '2026-11-05', 'claude', 'no data'), entry('S-10', 'pass', '2026-11-06', 'owner')]);
    expect(r.proposed.map(x => x.id)).toEqual(['S-01']);
    expect(r.proposed[0].proposed).toBe(true);
    expect(r.confirmed.map(x => x.id)).toEqual(['S-10', 'S-02']); // newest first
    expect(r.attention.map(x => x.id)).toEqual(['S-03']);
    expect(r.attention[0].proposed).toBe(true);
    expect(r.awaitingSpotCheck).toBe(2); // the claude pass and the claude blocked
    expect(r.recorded).toBe(4);
    expect(r.totals).toEqual({ scenarios: 4, pass: 3, fail: 0, blocked: 1, notRun: 0 });
    expect(r.device).toEqual({ total: 1, notTried: 0, emulated: 0, ownerRecorded: 1 });
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

  it('redacts a bare test domain in a note', () => {
    const r = buildReport(list, auto, [entry('S-01', 'pass', '2026-11-03', 'claude', 'signed in as diet-on-target (qa.invalid)')]);
    expect(r.proposed[0].note).toBe('signed in as diet-on-target ([test domain])');
  });

  it('puts no persona email in the data, with real scenarios and a note that quotes two', () => {
    const live = SCENARIOS.find(s => !s.retired && !s.device)!;
    const r = buildReport(SCENARIOS as never, automationOf as never, [entry(live.id, 'pass', '2026-11-03', 'claude', 'signed in as diet-on-target@qa.invalid, shown as n***@qa.invalid')]);
    expect(r.proposed[0].note).toBe('signed in as [email], shown as [email]');
    expect(JSON.stringify(r)).not.toMatch(/@|\.invalid/);
  });
});

describe('phone checklist', () => {
  it('lists every live phone scenario with its state, not-tried first, and leaves a failing one to attention', () => {
    const l = [sc('S-01', 'A', { device: true }), sc('S-02', 'A', { device: true }), sc('S-03', 'B', { device: true }), sc('S-04', 'B', { device: true, retired: true }), sc('S-05', 'B')];
    const r = buildReport(l, () => undefined, [entry('S-01', 'pass', '2026-11-03', 'owner'), entry('S-02', 'fail', '2026-11-04', 'owner', 'back-swipe broken')]);
    expect(r.phone.map(x => [x.id, x.state])).toEqual([['S-03', 'not tried'], ['S-01', 'passed, confirmed']]);
    expect(r.attention.map(x => x.id)).toEqual(['S-02']);
    expect(r.device).toEqual({ total: 3, notTried: 1, emulated: 0, ownerRecorded: 2 });
  });
});

describe('emulated phone runs', () => {
  const emu = (id: string, outcome: string, date: string, note = '') => ({ ...entry(id, outcome, date, 'claude', note), emulated: true });
  const l = [sc('S-01', 'A', { device: true }), sc('S-02', 'A', { device: true }), sc('S-03', 'B', { device: true }), sc('S-04', 'B')];

  it('shows an emulated-only pass in the phone checklist as emulated, and keeps it out of every pass count and the spot-check count', () => {
    const r = buildReport(l, () => undefined, [emu('S-01', 'pass', '2026-11-14')]);
    expect(r.phone.map(x => [x.id, x.state])).toEqual([['S-02', 'not tried'], ['S-03', 'not tried'], ['S-01', 'emulated pass']]);
    expect(r.totals).toEqual({ scenarios: 4, pass: 0, fail: 0, blocked: 0, notRun: 4 });
    expect(r.proposed).toEqual([]);
    expect(r.awaitingSpotCheck).toBe(0);
    expect(r.device).toEqual({ total: 3, notTried: 2, emulated: 1, ownerRecorded: 0 });
    expect(r.attention).toEqual([]);
  });

  it('puts an emulated fail or blocked under attention (not in the fail count) and keeps it in the phone checklist', () => {
    const r = buildReport(l, () => undefined, [emu('S-01', 'fail', '2026-11-14', 'layout broke'), emu('S-02', 'blocked', '2026-11-13')]);
    expect(r.attention.map(x => [x.id, x.outcome, x.emulated])).toEqual([['S-01', 'fail', true], ['S-02', 'blocked', true]]);
    expect(r.totals.fail).toBe(0);
    expect(r.totals.blocked).toBe(0);
    expect(r.phone.map(x => [x.id, x.state]).sort()).toEqual([['S-01', 'emulated fail'], ['S-02', 'emulated blocked'], ['S-03', 'not tried']]);
  });

  it('the owner phone pass wins over a newer emulated pass', () => {
    const r = buildReport(l, () => undefined, [entry('S-01', 'pass', '2026-11-10', 'owner'), emu('S-01', 'pass', '2026-11-14')]);
    expect(r.phone.find(x => x.id === 'S-01')?.state).toBe('passed, confirmed');
    expect(r.totals.pass).toBe(1);
    expect(r.device.ownerRecorded).toBe(1);
    expect(r.device.emulated).toBe(0);
  });

  it('a newer emulated fail is shown under attention beside the owner pass, but the phone state stays passed', () => {
    const r = buildReport(l, () => undefined, [entry('S-01', 'pass', '2026-11-10', 'owner'), emu('S-01', 'fail', '2026-11-14', 'now broken')]);
    expect(r.attention.map(x => [x.id, x.emulated])).toEqual([['S-01', true]]);
    expect(r.phone.find(x => x.id === 'S-01')?.state).toBe('passed, confirmed');
    expect(r.totals).toMatchObject({ pass: 1, fail: 0 });
  });

  it('an older emulated fail does not resurface once the owner has tried it on the phone since', () => {
    const r = buildReport(l, () => undefined, [emu('S-01', 'fail', '2026-11-09'), entry('S-01', 'pass', '2026-11-10', 'owner')]);
    expect(r.attention).toEqual([]);
  });

  it('draws it with the not-yet-checked-on-your-phone wording and never as a confirmed or proposed pass', () => {
    const out = renderReport(buildReport(l, () => undefined, [emu('S-01', 'pass', '2026-11-14'), emu('S-02', 'fail', '2026-11-14', 'x')]), { generatedOn: '2026-11-14' });
    expect(out).toContain('emulated by agent, not yet checked on your phone');
    expect(out).toContain('Emulated pass');
    expect(out).toContain('Emulated fail');
    const proposedPart = out.slice(out.indexOf('data-sec="proposed"'), out.indexOf('data-sec="confirmed"'));
    expect(proposedPart).not.toContain('S-01');
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

  it('shows phone scenarios in the Phone checklist and not in Not run', () => {
    const out = html([]);
    const notRunPart = out.slice(out.indexOf('data-sec="notrun"'), out.indexOf('class="foot"'));
    const phonePart = out.slice(out.indexOf('data-sec="phone"'), out.indexOf('data-sec="proposed"'));
    expect(phonePart).toContain('S-10');
    expect(notRunPart).not.toContain('S-10');
    expect(notRunPart).toContain('S-03');
  });
});

describe('buildSmokeBlock', () => {
  const now = new Date('2026-11-16T21:00:00Z');
  const run = (createdAt: string, conclusion: string | null, status = 'completed', url = 'https://github.com/o/r/actions/runs/1') => ({ createdAt, conclusion, status, headSha: 'abc', url });

  it('is unavailable when gh gave nothing usable', () => {
    for (const bad of [null, undefined, 'x', {}]) expect(buildSmokeBlock(bad as never, now)).toEqual({ available: false });
  });

  it('counts passed and failed runs in the last 7 days and names the newest run, whatever the row order', () => {
    const b = buildSmokeBlock([run('2026-11-14T15:00:00Z', 'success'), run('2026-11-16T20:21:42Z', 'success', 'completed', 'https://github.com/o/r/actions/runs/9'), run('2026-11-15T15:00:00Z', 'failure')], now);
    expect(b).toMatchObject({ available: true, runs: 3, passed: 2, failed: 1, windowDays: 7 });
    expect(b.last).toEqual({ at: '2026-11-16T20:21:42Z', result: 'passed', url: 'https://github.com/o/r/actions/runs/9' });
  });

  it('leaves a run older than 7 days out of the counts but still shows it as the last run', () => {
    const b = buildSmokeBlock([run('2026-11-01T08:15:00Z', 'failure')], now);
    expect(b).toMatchObject({ runs: 0, passed: 0, failed: 0 });
    expect(b.last).toMatchObject({ result: 'failed' });
  });

  it('a run in progress is running, a cancelled one is in neither count, a timeout is a failure', () => {
    const b = buildSmokeBlock([run('2026-11-16T20:00:00Z', null, 'in_progress'), run('2026-11-15T20:00:00Z', 'cancelled'), run('2026-11-14T20:00:00Z', 'timed_out')], now);
    expect(b.last?.result).toBe('running');
    expect(b).toMatchObject({ runs: 3, passed: 0, failed: 1 });
  });

  it('no runs at all is available with last null; a row with a bad date is skipped', () => {
    expect(buildSmokeBlock([], now)).toMatchObject({ available: true, runs: 0, last: null });
    expect(buildSmokeBlock([{ createdAt: 'nope' } as never], now).last).toBeNull();
  });
});

describe('renderReport smoke block', () => {
  const report = buildReport([sc('S-01', 'A')], () => undefined, []);
  const now = new Date('2026-11-16T21:00:00Z');

  it('says the status is not available when there is no smoke data, and the page still renders', () => {
    for (const smoke of [undefined, buildSmokeBlock(null, now)]) {
      const out = renderReport(report, { smoke });
      expect(out).toContain('Smoke status not available.');
      expect(out).toContain('CI evidence');
    }
  });

  it('draws the last run, the 7-day counts and a link, labelled as CI evidence apart from scenario results', () => {
    const out = renderReport(report, { smoke: buildSmokeBlock([{ createdAt: '2026-11-16T20:21:42Z', conclusion: 'success', status: 'completed', url: 'https://github.com/o/r/actions/runs/9' }], now) });
    expect(out).toContain('CI evidence');
    expect(out).toContain('not a scenario result');
    expect(out).toContain('2026-11-16 20:21 UTC');
    expect(out).toContain('<b>1</b> runs, <b>1</b> passed, <b>0</b> failed');
    expect(out).toContain('href="https://github.com/o/r/actions/runs/9"');
  });

  it('draws no link for a url that is not on github.com and escapes it', () => {
    const out = renderReport(report, { smoke: buildSmokeBlock([{ createdAt: '2026-11-16T20:21:42Z', conclusion: 'failure', status: 'completed', url: 'javascript:"><script>x</script>' }], now) });
    expect(out).not.toContain('javascript:');
    expect(out).toContain('failed');
  });
});
