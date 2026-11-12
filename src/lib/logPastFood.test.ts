import { describe, expect, it } from 'vitest';
import type { DietEntry } from '../types.ts';
import { shiftDay } from './dietLog.js';
import type { Food } from './foodMacros.js';
import { logPastFood, pastFoodAsRecipe } from './logPastFood.js';

const TODAY = '2026-11-11';
const chili: Food = { n: 'Chili', kcal: 400, p: 30, c: 40, f: 12 };

function fake() {
  const s = { entries: [] as DietEntry[], n: 0 };
  const ports = {
    addDietEntry: (d: Omit<DietEntry, 'id'>) => { const id = `e${++s.n}`; s.entries.push({ ...d, id }); return { id, error: null as string | null }; },
    removeDietEntry: (id: string) => { s.entries = s.entries.filter(e => e.id !== id); },
  };
  return { s, ports };
}

describe('a past food as a log control recipe', () => {
  it('has no id, so nothing can plan it, and carries its numbers', () => {
    const r = pastFoodAsRecipe(chili);
    expect(r.id).toBe('');
    expect([r.n, r.kcal, r.p, r.c, r.f]).toEqual(['Chili', 400, 30, 40, 12]);
  });
});

describe('logPastFood', () => {
  it('logs scaled numbers without a recipe link and words it', () => {
    const { s, ports } = fake();
    const made = logPastFood(ports, chili, 1.5, TODAY, TODAY);
    expect(made.ok).toBe(true);
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]).toMatchObject({ d: TODAY, n: 'Chili', kcal: 600, p: 45, c: 60, f: 18 });
    expect(s.entries[0]).not.toHaveProperty('from');
    if (made.ok) expect(made.text).toMatch(/^Logged Chili: .* to today\.$/);
  });
  it('keeps the recipe link a past food already had', () => {
    const { s, ports } = fake();
    logPastFood(ports, { ...chili, from: 'r9' }, 1, TODAY, TODAY);
    expect(s.entries[0]?.from).toBe('r9');
  });
  it('Undo removes only that entry', () => {
    const { s, ports } = fake();
    logPastFood(ports, { n: 'Tea', kcal: 5, p: 0 }, 1, TODAY, TODAY);
    const made = logPastFood(ports, chili, 1, TODAY, TODAY);
    if (made.ok) made.undo();
    expect(s.entries.map(e => e.n)).toEqual(['Tea']);
  });
  it('refuses a day ahead (there is no recipe to plan) and logs nothing', () => {
    const { s, ports } = fake();
    const made = logPastFood(ports, chili, 1, shiftDay(TODAY, 1), TODAY);
    expect(made.ok).toBe(false);
    expect(s.entries).toHaveLength(0);
  });
  it('refuses numbers out of range', () => {
    const { s, ports } = fake();
    expect(logPastFood(ports, { n: 'Huge', kcal: 99999999, p: 1 }, 1, TODAY, TODAY).ok).toBe(false);
    expect(s.entries).toHaveLength(0);
  });
  it('passes the store error on', () => {
    const made = logPastFood({ addDietEntry: () => ({ id: null, error: 'Up to 20 entries a day.' }), removeDietEntry: () => {} }, chili, 1, TODAY, TODAY);
    expect(made).toEqual({ ok: false, error: 'Up to 20 entries a day.' });
  });
});
