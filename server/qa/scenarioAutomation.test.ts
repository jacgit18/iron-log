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

  it('names only e2e/, e2e-qa/, server/ or src/ files, and at least one that fits the kind (e2e, api, unit)', () => {
    const own = { e2e: ['e2e/', 'e2e-qa/'], api: ['server/'], unit: ['src/'] } as const;
    const all = Object.values(own).flat();
    for (const [id, a] of Object.entries(AUTOMATION)) {
      for (const f of a.specs ?? []) expect(all.some(p => f.startsWith(p)), `${id} ${f}`).toBe(true);
      if (a.auto !== 'manual') {
        const prefixes: readonly string[] = own[a.auto];
        expect((a.specs ?? []).some(f => prefixes.some(p => f.startsWith(p))), `${id} has no ${a.auto} spec`).toBe(true);
      }
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
