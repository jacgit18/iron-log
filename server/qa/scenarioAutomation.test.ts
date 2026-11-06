import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUTOMATION, automationOf, coverageCounts } from './scenarioAutomation.ts';
import { SCENARIOS } from './scenarios.ts';

describe('QA scenario automation tags', () => {
  const ids = new Set(SCENARIOS.map(s => s.id));

  it('tags only scenarios that exist', () => {
    for (const id of Object.keys(AUTOMATION)) expect(ids.has(id), `${id} is not a scenario`).toBe(true);
  });

  it('names existing spec files for an e2e or api tag, and none for a manual one', () => {
    for (const [id, a] of Object.entries(AUTOMATION)) {
      if (a.auto === 'manual') expect(a.specs, `${id} manual has no specs`).toBeUndefined();
      else {
        expect(a.specs?.length, `${id} needs a spec`).toBeGreaterThan(0);
        for (const f of a.specs ?? []) expect(existsSync(f), `${id} names ${f}, which does not exist`).toBe(true);
      }
    }
  });

  it('kinds fit the file: e2e names e2e/ specs, api names server/ tests, unit names src/ tests', () => {
    for (const [id, a] of Object.entries(AUTOMATION)) {
      for (const f of a.specs ?? []) expect(f.startsWith({ e2e: 'e2e/', api: 'server/', unit: 'src/', manual: '' }[a.auto]), `${id} ${f}`).toBe(true);
    }
  });

  it('never tags a scenario that needs a real phone as automated', () => {
    for (const s of SCENARIOS.filter(s => s.device)) expect(automationOf(s.id)?.auto ?? 'manual', s.id).toBe('manual');
  });

  it('counts every scenario once, with untagged ones as their own class', () => {
    const c = coverageCounts(SCENARIOS.map(s => s.id));
    expect(c.e2e + c.api + c.unit + c.manual + c.untagged).toBe(SCENARIOS.length);
    expect(coverageCounts(['S-998']).untagged).toBe(1);
  });

  it('gives a partial note only to a tag that has specs', () => {
    for (const [id, a] of Object.entries(AUTOMATION)) if (a.partial !== undefined) {
      expect(a.auto, id).not.toBe('manual');
      expect(a.partial.trim().length, id).toBeGreaterThan(10);
    }
  });
});
