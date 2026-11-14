import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PERSONAS, personaById } from './personas.ts';
import { SCENARIO_FEATURES, SCENARIOS, scenarioById, scenariosForPersona } from './scenarios.ts';

describe('QA scenarios', () => {
  it('has at least 35 live scenarios (the first batch was 40) with ids S-01 upward, unique, well formed and in order', () => {
    expect(SCENARIOS.filter(s => !s.retired).length).toBeGreaterThanOrEqual(35);
    expect(new Set(SCENARIOS.map(s => s.id)).size).toBe(SCENARIOS.length);
    for (const s of SCENARIOS) expect(s.id).toMatch(/^S-\d{2,}$/);
    // A gap is allowed: two branches that each add a scenario cannot both take the next number until the first merges.
    SCENARIOS.forEach((s, i) => { if (i > 0) expect(Number(s.id.slice(2)), `${s.id} after ${SCENARIOS[i - 1]!.id}`).toBeGreaterThan(Number(SCENARIOS[i - 1]!.id.slice(2))); });
  });

  it('keeps every id from S-01 to S-300: a scenario that no longer applies is retired, never deleted', () => {
    // The first 300 ids were merged before the split and are fixed. Above them a gap is allowed (parallel branches), so raise this number
    // only when you want the newer ids guarded the same way.
    const ids = new Set(SCENARIOS.map(s => s.id));
    for (let n = 1; n <= 300; n++) expect(ids.has(`S-${String(n).padStart(2, '0')}`), `S-${String(n).padStart(2, '0')} is missing: set retired: true on the scenario instead of deleting its file`).toBe(true);
  });

  it('has one file per scenario, named after its id, and no other file in the folder', async () => {
    const dir = fileURLToPath(new URL('./scenarios/', import.meta.url));
    const names = readdirSync(dir);
    expect(names.filter(name => !/^S-\d+\.ts$/.test(name)), 'files in server/qa/scenarios/ that are not S-<number>.ts').toEqual([]);
    for (const name of names) {
      const scenario = (await import(pathToFileURL(dir + name).href)).default as { id: string };
      // The name is the id, so two files cannot hold the same id: a clash shows as this message, naming the file and the id inside it.
      expect(scenario.id, `${name} holds the scenario ${scenario.id}; rename the file or give the scenario its own id (node scripts/next-scenario-id.mjs)`).toBe(name.slice(0, -3));
    }
    expect(names.length).toBe(SCENARIOS.length);
  });

  it('names an existing test account for every scenario', () => {
    for (const s of SCENARIOS) expect(personaById(s.persona), `${s.id} persona ${s.persona}`).toBeDefined();
  });

  it('gives every scenario a title, a brief, steps and expected results', () => {
    for (const s of SCENARIOS) {
      expect(s.title.trim().length, `${s.id} title`).toBeGreaterThan(5);
      expect(s.brief.trim().length, `${s.id} brief`).toBeGreaterThan(0);
      expect(s.steps.length, `${s.id} steps`).toBeGreaterThan(0);
      expect(s.expected.length, `${s.id} expected`).toBeGreaterThan(0);
      for (const t of [...s.steps, ...s.expected]) expect(t.trim().length, s.id).toBeGreaterThan(5);
    }
  });

  it('claims no result: nothing in a scenario says it passed', () => {
    for (const s of SCENARIOS) {
      expect(Object.keys(s)).not.toContain('result');
      expect(Object.keys(s)).not.toContain('passed');
    }
  });

  it('uses every Diet account at least once', () => {
    for (const p of PERSONAS.filter(p => p.group === 'Diet')) expect(scenariosForPersona(p.id).length, p.id).toBeGreaterThan(0);
  });

  it('covers every feature with a live scenario and spells each feature name one way', () => {
    for (const f of SCENARIO_FEATURES) expect(SCENARIOS.some(s => s.feature === f && !s.retired), f).toBe(true);
    // The feature list is read from the scenario files, so a typo would start a new feature: two names that differ only in case, spacing or punctuation fail here.
    const seen = new Map<string, string>();
    for (const f of SCENARIO_FEATURES) {
      const key = f.toLowerCase().replace(/[^a-z0-9]/g, '');
      expect(seen.get(key), `"${f}" and "${seen.get(key)}" look like one feature spelled two ways`).toBeUndefined();
      seen.set(key, f);
    }
  });

  it('marks the share target and other phone-only scenarios as device', () => {
    const share = SCENARIOS.filter(s => s.feature === 'Share target');
    expect(share.length).toBeGreaterThan(0);
    for (const s of share) expect(s.device, s.id).toBe(true);
    for (const s of SCENARIOS.filter(s => s.device)) expect(s.feature === 'Share target' || /phone|back-swipe/i.test(s.steps.join(' ')), s.id).toBe(true);
  });

  it('gives every listed feature a happy-path scenario, not only edge cases', () => {
    for (const f of SCENARIO_FEATURES) expect(SCENARIOS.some(s => s.feature === f && !s.retired && !s.edge), f).toBe(true);
  });

  it('names the brief a scenario comes from as a slug or "feature-map", so it can be found', () => {
    for (const s of SCENARIOS) expect(s.brief, s.id).toMatch(/^(feature-map|[a-z0-9]+(-[a-z0-9]+)*)$/);
  });

  it('looks up by id and by account', () => {
    expect(scenarioById('S-01')?.persona).toBe('diet-on-target');
    expect(scenarioById('S-999')).toBeUndefined();
    expect(scenariosForPersona('diet-on-target').map(s => s.id)).toContain('S-01');
    expect(scenariosForPersona('no-such-account')).toEqual([]);
  });
});
