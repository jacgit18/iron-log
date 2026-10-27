import { describe, expect, it } from 'vitest';
import { PERSONAS, personaAuthId, personaById, personaEmail } from './personas.ts';
import { buildPersonaRows } from './seedPlan.ts';

const TODAY = new Date('2026-10-27T12:00:00Z');
const EXERCISES = ['latpd', 'chestpress', 'zercher', 'hipthrust', 'dip', 'legext'];

describe('QA personas', () => {
  it('has unique ids and emails that can never be a real address', () => {
    expect(new Set(PERSONAS.map(p => p.id)).size).toBe(PERSONAS.length);
    for (const p of PERSONAS) {
      expect(p.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(personaEmail(p.id)).toMatch(/@qa\.invalid$/);
      expect(personaAuthId(p.id)).toBe(`qa-persona-${p.id}`);
      expect(personaById(p.id)).toBe(p);
    }
  });

  it('describes every persona, with no admin among them', () => {
    for (const p of PERSONAS) {
      expect(p.scenario.length).toBeGreaterThan(10);
      expect(p.tryThis.length).toBeGreaterThan(10);
    }
    expect(PERSONAS.some(p => p.id.includes('admin'))).toBe(false);
  });

  it('builds exactly the rows each persona describes', () => {
    for (const p of PERSONAS) {
      const rows = buildPersonaRows(p, EXERCISES, TODAY);
      expect(rows.logs).toHaveLength(p.data.logEntries);
      expect(rows.body).toHaveLength(p.data.bodyWeeks);
      expect(rows.groceryItems).toHaveLength(p.data.groceryItems);
      expect(rows.programs).toBe(p.data.programs);
      expect(rows.erased).toBe(p.data.erased === true);
    }
  });

  it('gives the same rows for the same persona and day (a re-run restores, never drifts)', () => {
    const p = personaById('heavy-logger')!;
    expect(buildPersonaRows(p, EXERCISES, TODAY)).toEqual(buildPersonaRows(p, EXERCISES, TODAY));
  });

  it('keeps log rows inside the database checks and unique by client id', () => {
    const rows = buildPersonaRows(personaById('three-year-veteran')!, EXERCISES, TODAY);
    expect(new Set(rows.logs.map(l => l.clientId)).size).toBe(rows.logs.length);
    for (const l of rows.logs) {
      expect(l.clientId.length).toBeLessThanOrEqual(100);
      expect(l.weightLb).toBeGreaterThanOrEqual(0);
      expect(l.weightLb).toBeLessThan(5000);
      expect(l.d <= '2026-10-27').toBe(true);
      expect(new Date(`${l.wk}T00:00:00Z`).getUTCDay()).toBe(1);
    }
    expect(new Set(rows.body.map(b => b.wk)).size).toBe(rows.body.length);
  });

  it('puts the grocery-at-cap persona on the catalogue cap and the shopper under it', () => {
    expect(buildPersonaRows(personaById('grocery-at-cap')!, EXERCISES, TODAY).groceryItems).toHaveLength(500);
    expect(buildPersonaRows(personaById('grocery-shopper')!, EXERCISES, TODAY).groceryItems.length).toBeLessThan(500);
  });
});
