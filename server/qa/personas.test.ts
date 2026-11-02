import { describe, expect, it } from 'vitest';
import { normDietCfg, normDietEntries } from '../../src/shared/diet.ts';
import { normRecipes } from '../../src/shared/recipes.ts';
import { PERSONAS, personaAuthId, personaById, personaEmail } from './personas.ts';
import { buildPersonaRows, DIET_TARGETS } from './seedPlan.ts';

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
      expect(rows.recipes).toHaveLength(p.data.recipes ?? 0);
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

  describe('the Diet group', () => {
    const rowsOf = (id: string) => buildPersonaRows(personaById(id)!, EXERCISES, TODAY);
    const sumOn = (rows: ReturnType<typeof rowsOf>, d: string, k: 'kcal' | 'p') => rows.dietEntries.filter(e => e.data.d === d).reduce((a, e) => a + e.data[k], 0);

    it('has the five diet accounts, and 17 in all', () => {
      expect(PERSONAS.filter(p => p.group === 'Diet').map(p => p.id)).toEqual(['diet-on-target', 'diet-over-target', 'diet-fresh', 'meal-planner', 'recipe-collector']);
      expect(PERSONAS).toHaveLength(17);
    });

    it('puts the on-target account at about 60% of its calories today, with 14 days logged and targets set', () => {
      const r = rowsOf('diet-on-target');
      expect(new Set(r.dietEntries.map(e => e.data.d)).size).toBe(14);
      expect(sumOn(r, '2026-10-27', 'kcal') / DIET_TARGETS.kcal).toBeCloseTo(0.6, 1);
      expect(r.config?.diet).toMatchObject(DIET_TARGETS);
    });

    it('puts the over-target account at about 120% of its calories and short on protein today', () => {
      const r = rowsOf('diet-over-target');
      expect(sumOn(r, '2026-10-27', 'kcal') / DIET_TARGETS.kcal).toBeCloseTo(1.2, 1);
      expect(sumOn(r, '2026-10-27', 'p')).toBeLessThan(DIET_TARGETS.protein * 0.7);
    });

    it('gives the fresh account no targets, no log and no recipes', () => {
      const r = rowsOf('diet-fresh');
      expect(r.config).toBeNull();
      expect(r.dietEntries).toHaveLength(0);
      expect(r.recipes).toHaveLength(0);
    });

    it('gives the planner 4 saved meals, 4 recipes and a 7-day plan that points at them, with portions', () => {
      const r = rowsOf('meal-planner');
      const diet = r.config!.diet as { meals: { id: string }[]; plan: Record<string, { k: string; id: string; x?: number }[]> };
      expect(diet.meals).toHaveLength(4);
      expect(r.recipes).toHaveLength(4);
      expect(Object.keys(diet.plan)).toHaveLength(7);
      const mealIds = new Set(diet.meals.map(m => m.id)), recipeIds = new Set(r.recipes.map(x => x.clientId));
      const items = Object.values(diet.plan).flat();
      for (const it of items) expect(it.k === 'm' ? mealIds : recipeIds).toContain(it.id);
      expect(items.some(it => it.x === 1.5)).toBe(true);
    });

    it('gives the collector 30 recipes with nutrition and 30 grocery items', () => {
      const r = rowsOf('recipe-collector');
      expect(r.recipes).toHaveLength(30);
      expect(r.groceryItems).toHaveLength(30);
      expect(new Set(r.recipes.map(x => x.data.n)).size).toBe(30);
      for (const x of r.recipes) expect(x.data.kcal).toBeGreaterThan(0);
    });

    it('writes only what the app\'s own cleaners keep (nothing is silently dropped on load)', () => {
      for (const id of ['diet-on-target', 'meal-planner', 'recipe-collector']) {
        const r = rowsOf(id);
        expect(normDietEntries(r.dietEntries.map(e => e.data))).toHaveLength(r.dietEntries.length);
        expect(normRecipes(r.recipes.map(x => x.data))).toHaveLength(r.recipes.length);
        if (r.config) {
          const kept = normDietCfg(r.config.diet, '2026-10-27')!;
          expect(Object.keys(kept.plan ?? {})).toHaveLength(Object.keys((r.config.diet.plan as object) ?? {}).length);
          expect(kept.meals ?? []).toHaveLength(((r.config.diet.meals as unknown[]) ?? []).length);
        }
      }
    });

    it('keeps diet rows inside the limits the app enforces', () => {
      for (const id of ['diet-on-target', 'diet-over-target', 'meal-planner']) {
        const r = rowsOf(id);
        expect(new Set(r.dietEntries.map(e => e.clientId)).size).toBe(r.dietEntries.length);
        for (const e of r.dietEntries) { expect(e.clientId.length).toBeLessThanOrEqual(60); expect(e.position).toBeGreaterThan(0); }
      }
    });
  });
});
