import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../server/qa/scenarios.ts';
import { buildDoc, docIssues } from './qa-scenarios-doc.mjs';

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
    expect(docIssues(`${doc}\n### S-98. Gone\n`)).toEqual(['S-98 is on the page but not in the list']);
    expect(docIssues(doc.replace(/^(### S-02\. .*)$/m, '$1 (retired)'))).toEqual(['S-02 is live in the list but retired on the page']);
  });
  it('reports a scenario whose steps or title changed in the list, not only its id', () => {
    expect(docIssues(doc.replace(/^  1\. .*$/m, '  1. An old first step'))).toEqual([expect.stringMatching(/^S-\d+ reads differently/)]);
    expect(docIssues(doc.replace(/^(### S-03\. )/m, '$1Old title: '))).toEqual(['S-03 reads differently on the page than in the list (title, account, steps or expected lines changed)']);
  });
});
