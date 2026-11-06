import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../server/qa/scenarios.ts';
import { buildDoc, docIssues, recordedResults, resultsOf } from './qa-scenarios-doc.mjs';

describe('QA scenarios page', () => {
  const doc = buildDoc();
  it('has a heading for every scenario in the list, and a summary row', () => {
    for (const s of SCENARIOS) expect(doc).toContain(`### ${s.id}. ${s.title}`);
    expect(doc).toContain('## Summary');
  });
  it('matches the list when freshly generated, with or without Results filled in by hand', () => {
    expect(docIssues(doc)).toEqual([]);
    expect(docIssues(doc.replaceAll('\\_\\_\\_', '2026-11-01 pass'))).toEqual([]);
  });
  it('reports a missing, an unknown and a wrongly retired scenario', () => {
    expect(docIssues(doc.replace(/^### S-01\. .*$/m, ''))).toEqual(['S-01 is not on the page']);
    expect(docIssues(`${doc}\n### S-998. Gone\n`)).toEqual(['S-998 is on the page but not in the list']);
    expect(docIssues(doc.replace(/^(### S-02\. .*)$/m, '$1 (retired)'))).toEqual(['S-02 is live in the list but retired on the page']);
  });
  it('reports a scenario whose steps or title changed in the list, not only its id', () => {
    expect(docIssues(doc.replace(/^  1\. .*$/m, '  1. An old first step'))).toEqual([expect.stringMatching(/^S-\d+ reads differently/)]);
    expect(docIssues(doc.replace(/^(### S-03\. )/m, '$1Old title: '))).toEqual(['S-03 reads differently on the page than in the list (title, account, steps, expected or automation lines changed)']);
  });

  describe('regenerating over a page with Results written by hand', () => {
    const owner = doc
      .replace(/^(\| S-01 \|.*\|)  \|$/m, '$1 2026-11-02 pass; one \\| in the note |')
      .replace(/^(\| S-44 \|.*\|)  \|$/m, '$1 not run: needs a phone |')
      .replace(/^(- \*\*Result\*\* \(date, pass or fail, note\): )\\_\\_\\_$/m, '$12026-11-02 pass under the scenario')
      .replace(/^Status: .*$/m, 'Status: walked 2026-11-02')
      .replace(/^EditDate: .*$/m, 'EditDate: 2000-01-01');

    it('reads each non-empty Result by scenario id, and none for a blank page', () => {
      expect(resultsOf(doc).size).toBe(0);
      const got = resultsOf(owner);
      expect(got.get('S-01')?.cell).toBe('2026-11-02 pass; one \\| in the note');
      expect(got.get('S-01')?.line).toBe('2026-11-02 pass under the scenario');
      expect(got.get('S-44')?.cell).toBe('not run: needs a phone');
      expect(got.has('S-02')).toBe(false);
    });

    it('carries every Result forward, and the properties block with today as EditDate', () => {
      const again = buildDoc(owner);
      expect(again).toContain('| S-01 | Diet targets and log | `diet-on-target` |  | 2026-11-02 pass; one \\| in the note |');
      expect(again).toMatch(/^\| S-44 \|.*\| not run: needs a phone \|$/m);
      expect(again).toContain('2026-11-02 pass under the scenario');
      expect(again).toContain('Status: walked 2026-11-02');
      expect(again).not.toContain('EditDate: 2000-01-01');
      expect(again).toMatch(/^EditDate: \d{4}-\d{2}-\d{2}$/m);
      expect([...resultsOf(again)].map(([id, r]) => [id, r])).toEqual([...resultsOf(owner)].map(([id, r]) => [id, r]));
      expect(docIssues(again)).toEqual([]);
    });

    it('is stable: regenerating twice gives the same page', () => {
      const once = buildDoc(owner);
      expect(buildDoc(once)).toBe(once);
    });

    it('starts a page with a full properties block when there is none to keep', () => {
      expect(doc.startsWith('---\ndg-publish: false\ntags:\n')).toBe(true);
      expect(doc).toMatch(/^Purpose: .+\nStatus: .+\n/m);
      expect(doc.split('\n').indexOf('---', 1)).toBeGreaterThan(5);
    });
  });

  describe('automation tags and recorded results (brief: qa-scenario-automation)', () => {
    it('builds with no vault access and shows an Automation line per scenario and a coverage line that adds up', () => {
      expect((doc.match(/^- \*\*Automation:\*\* /gm) ?? []).length).toBe(SCENARIOS.length);
      const m = doc.match(/Automation: (\d+) e2e, (\d+) api, (\d+) manual, (\d+) untagged\./);
      expect(m && m.slice(1).map(Number).reduce((a, b) => a + b, 0)).toBe(SCENARIOS.filter(s => !s.retired).length);
    });

    it('fills a Result and the Summary cell from the results file, and it wins over a hand-written one', () => {
      const recorded = recordedResults(JSON.stringify([{ id: 'S-01', outcome: 'pass', date: '2026-11-06', by: 'claude', note: 'ok' }]));
      const handWritten = doc.replace(/^(- \*\*Result\*\* \(date, pass or fail, note\): )\\_\\_\\_$/m, '$12026-11-02 fail by hand');
      const page = buildDoc(handWritten, recorded);
      expect(resultsOf(page).get('S-01')?.line).toBe('2026-11-06 pass (claude): ok');
      expect(resultsOf(page).get('S-01')?.cell).toBe('2026-11-06 pass (claude): ok');
      expect(docIssues(page)).toEqual([]);
    });

    it('escapes a | in a recorded note so the Summary row keeps its columns', () => {
      const page = buildDoc('', recordedResults(JSON.stringify([{ id: 'S-01', outcome: 'pass', date: '2026-11-06', by: 'owner', note: 'a | b' }])));
      const row = page.split('\n').find(l => l.startsWith('| S-01 |')) ?? '';
      expect(row).toContain('a \\| b');
      expect(resultsOf(page).get('S-01')?.cell).toBe('2026-11-06 pass: a \\| b');
    });

    it('keeps a hand-written Result for a scenario with no recorded entry', () => {
      const handWritten = doc.replace(/^(- \*\*Result\*\* \(date, pass or fail, note\): )\\_\\_\\_$/m, '$12026-11-02 fail by hand');
      expect(resultsOf(buildDoc(handWritten, recordedResults(''))).get('S-01')?.line).toBe('2026-11-02 fail by hand');
    });
  });
});
