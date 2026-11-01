import { describe, expect, it } from 'vitest';
import { PERSONAS, personaById } from './personas.ts';
import { SCENARIO_FEATURES, SCENARIOS, scenarioById, scenariosForPersona } from './scenarios.ts';

describe('QA scenarios', () => {
  it('has 35 to 40 scenarios with ids S-01 upward, unique', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(35);
    expect(SCENARIOS.length).toBeLessThanOrEqual(40);
    expect(new Set(SCENARIOS.map(s => s.id)).size).toBe(SCENARIOS.length);
    for (const s of SCENARIOS) expect(s.id).toMatch(/^S-\d{2,}$/);
    SCENARIOS.forEach((s, i) => expect(s.id).toBe(`S-${String(i + 1).padStart(2, '0')}`));
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

  it('covers every listed feature and uses no feature that is not listed', () => {
    for (const f of SCENARIO_FEATURES) expect(SCENARIOS.some(s => s.feature === f && !s.retired), f).toBe(true);
    for (const s of SCENARIOS) expect(SCENARIO_FEATURES, s.id).toContain(s.feature);
  });

  it('marks the share target and other phone-only scenarios as device', () => {
    const share = SCENARIOS.filter(s => s.feature === 'Share target');
    expect(share.length).toBeGreaterThan(0);
    for (const s of share) expect(s.device, s.id).toBe(true);
    for (const s of SCENARIOS.filter(s => s.device)) expect(s.feature === 'Share target' || /phone|back-swipe/i.test(s.steps.join(' ')), s.id).toBe(true);
  });

  it('looks up by id and by account', () => {
    expect(scenarioById('S-01')?.persona).toBe('diet-on-target');
    expect(scenarioById('S-99')).toBeUndefined();
    expect(scenariosForPersona('diet-on-target').map(s => s.id)).toContain('S-01');
    expect(scenariosForPersona('no-such-account')).toEqual([]);
  });
});
