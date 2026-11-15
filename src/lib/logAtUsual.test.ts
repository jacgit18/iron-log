import { describe, expect, it } from 'vitest';
import type { DietEntry } from '../types.ts';
import { logFoodAtUsual, logRecipeAtUsual } from './logAtUsual.js';
import { entryTotalsAt, stepEntryCount } from './portionBasis.js';

const TODAY = '2026-11-15';
const oats = { id: 'r1', n: 'Oats', cat: 'other' as const, kcal: 300, p: 10, c: 50, f: 5 };

function fake() {
  const s = { entries: [] as DietEntry[], n: 0 };
  const ports = {
    addDietEntry: (d: Omit<DietEntry, 'id'>) => { const id = `e${++s.n}`; s.entries.push({ ...d, id }); return { id, error: null as string | null }; },
    removeDietEntry: (id: string) => { s.entries = s.entries.filter(e => e.id !== id); },
  };
  return { s, ports };
}

describe('logRecipeAtUsual', () => {
  it('logs one portion when the recipe has no usual, linked to the recipe', () => {
    const { s, ports } = fake();
    const made = logRecipeAtUsual(ports, oats, TODAY, TODAY);
    expect(made.ok && made.text).toBe('Logged Oats, 1 portion.');
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]).toMatchObject({ d: TODAY, n: 'Oats', kcal: 300, from: 'r1', x: 1 });
  });
  it('logs at the usual portion with its numbers scaled', () => {
    const { s, ports } = fake();
    const made = logRecipeAtUsual(ports, { ...oats, usual: 1.5 }, TODAY, TODAY);
    expect(made.ok && made.text).toBe('Logged Oats, 1.5 portions.');
    expect(s.entries[0]).toMatchObject({ kcal: 450, x: 1.5 });
  });
  it('Undo removes exactly the entry that was logged', () => {
    const { s, ports } = fake();
    ports.addDietEntry({ d: TODAY, n: 'Other', kcal: 1, p: 1 });
    const made = logRecipeAtUsual(ports, oats, TODAY, TODAY);
    if (made.ok) made.undo();
    expect(s.entries.map(e => e.n)).toEqual(['Other']);
  });
  it('refuses a recipe with no numbers and logs nothing', () => {
    const { s, ports } = fake();
    const made = logRecipeAtUsual(ports, { id: 'r2', n: 'Bare', cat: 'other' }, TODAY, TODAY);
    expect(made.ok).toBe(false);
    expect(s.entries).toHaveLength(0);
  });
  it('says the store\'s words when the store refuses (20 a day)', () => {
    const made = logRecipeAtUsual({ addDietEntry: () => ({ id: null, error: 'That’s 20 things for the day.' }), removeDietEntry: () => {} }, oats, TODAY, TODAY);
    expect(made).toEqual({ ok: false, error: 'That’s 20 things for the day.' });
  });
});

describe('logFoodAtUsual', () => {
  it('logs a food with no recipe at one portion, with no recipe link', () => {
    const { s, ports } = fake();
    const made = logFoodAtUsual(ports, { n: 'Chili', kcal: 400, p: 30 }, TODAY, TODAY);
    expect(made.ok && made.text).toBe('Logged Chili, 1 portion.');
    expect(s.entries[0]).toMatchObject({ n: 'Chili', kcal: 400, x: 1 });
    expect(s.entries[0]).not.toHaveProperty('from');
  });
  it('keeps the portion count of the entry it came from: three portions stay three, and Less then steps one portion down', () => {
    const { s, ports } = fake();
    const made = logFoodAtUsual(ports, { n: 'Chili', kcal: 1200, p: 90, x: 3 }, TODAY, TODAY);
    expect(made.ok && made.text).toBe('Logged Chili, 3 portions.');
    expect(s.entries[0]).toMatchObject({ kcal: 1200, p: 90, x: 3 });
    const down = entryTotalsAt(s.entries[0]!, stepEntryCount(s.entries[0]!, -1)!)!;
    expect([down.x, down.kcal]).toEqual([2.5, 1000]); // not 600, which halving the three-portion totals as "one portion" would give
  });
  it('Undo removes exactly that entry', () => {
    const { s, ports } = fake();
    const made = logFoodAtUsual(ports, { n: 'Chili', kcal: 400, p: 30 }, TODAY, TODAY);
    if (made.ok) made.undo();
    expect(s.entries).toHaveLength(0);
  });
});
