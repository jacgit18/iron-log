import { describe, expect, it } from 'vitest';
import { normDietCfg, normDietEntries } from '../../src/shared/diet.ts';
import { normSupplementItem } from '../../src/shared/listItems.ts';
import { normRecipes } from '../../src/shared/recipes.ts';
import { BUILTIN_EXERCISES } from './builtinExercises.ts';
import { SEED_EXERCISE_IDS } from './seedPersona.ts';
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
      expect(rows.recipes).toHaveLength((p.data.recipes ?? 0) + (p.data.vitamins ? 1 : 0) + (p.data.noFatRecipe ? 1 : 0)); // the vitamin persona adds one ready-made food, the no-fat flag one recipe
      expect(rows.stretches).toHaveLength(p.data.watchLinks ? 1 : 0);
    }
  });

  it('gives the same rows for the same persona and day (a re-run restores, never drifts)', () => {
    const p = personaById('heavy-logger')!;
    expect(buildPersonaRows(p, EXERCISES, TODAY)).toEqual(buildPersonaRows(p, EXERCISES, TODAY));
  });

  it('gives the heavy logger one exercise the app suggests going up on, and keeps the log count', () => {
    const p = personaById('heavy-logger')!;
    const rows = buildPersonaRows(p, [...EXERCISES, 'cablecrunch'], TODAY);
    expect(rows.logs).toHaveLength(p.data.logEntries);
    expect(new Set(rows.logs.map(l => l.clientId)).size).toBe(rows.logs.length);
    // Two full 4 x 6 strength days at one weight is what makes the app suggest going up (progressionOf: 105 at the default step, 110 with a step of 10; checked by hand, server/ may not import src/lib).
    const strength = rows.logs.filter(l => l.exerciseId === 'cablecrunch' && l.phase === 'strength');
    expect(strength.map(l => [l.d, l.weightLb, l.setsCount, l.reps])).toEqual([['2026-10-24', 100, 4, 6], ['2026-10-26', 100, 4, 6]]);
  });

  it('leaves the heavy logger without the extra entries when the exercise is not in the program set', () => {
    const p = personaById('heavy-logger')!;
    expect(buildPersonaRows(p, EXERCISES, TODAY).logs).toHaveLength(p.data.logEntries);
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

  describe('the exercise library', () => {
    const all = Object.keys(BUILTIN_EXERCISES);

    it('lists every exercise the programs use in cfg.ex of each account that has programs, with name and equipment', () => {
      for (const p of PERSONAS) {
        const r = buildPersonaRows(p, all, TODAY);
        if (!p.data.programs) { expect(r.config?.ex).toBeUndefined(); continue; }
        expect(Object.keys(r.config!.ex!)).toEqual(all);
        const { url, ...rest } = r.config!.ex!['latpd']!; // the collector's first exercise also carries a video link (watchLinks)
        expect(rest).toEqual({ n: BUILTIN_EXERCISES['latpd']!.n, eq: 'cable' });
        expect(url !== undefined).toBe(p.data.watchLinks === true);
      }
    });

    it('has 30 or more exercises for the superset builder and the heavy logger, so the two-column layout shows', () => {
      for (const id of ['superset-builder', 'heavy-logger']) {
        expect(Object.keys(buildPersonaRows(personaById(id)!, SEED_EXERCISE_IDS, TODAY).config!.ex!).length).toBeGreaterThanOrEqual(30);
      }
    });

    it('keeps the diet document beside the exercises, and skips ids it has no name for', () => {
      const r = buildPersonaRows(personaById('meal-planner')!, [...EXERCISES, 'no-such-exercise'], TODAY);
      expect(r.config?.diet).toMatchObject(DIET_TARGETS);
      expect(r.config?.ex).not.toHaveProperty('no-such-exercise');
    });
  });

  describe('the Diet group', () => {
    const rowsOf = (id: string) => buildPersonaRows(personaById(id)!, EXERCISES, TODAY);
    const sumOn = (rows: ReturnType<typeof rowsOf>, d: string, k: 'kcal' | 'p') => rows.dietEntries.filter(e => e.data.d === d).reduce((a, e) => a + e.data[k], 0);

    it('has the eight diet accounts, and 20 in all', () => {
      expect(PERSONAS.filter(p => p.group === 'Diet').map(p => p.id)).toEqual(['diet-on-target', 'diet-over-target', 'diet-fresh', 'meal-planner', 'recipes-full', 'vitamin-tracker', 'supplement-stack', 'recipe-collector']);
      expect(PERSONAS).toHaveLength(20);
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
      expect(r.config?.diet).toBeUndefined();
      expect(r.dietEntries).toHaveLength(0);
      expect(r.recipes).toHaveLength(0);
    });

    it('gives the planner 4 saved meals, 5 recipes (the fifth with no fat figure, unplanned) and a 7-day plan that points at them, with portions', () => {
      const r = rowsOf('meal-planner');
      const diet = r.config!.diet as { meals: { id: string }[]; plan: Record<string, { k: string; id: string; x?: number }[]> };
      expect(diet.meals).toHaveLength(4);
      expect(r.recipes).toHaveLength(5);
      const noFat = r.recipes.filter(x => x.data.f === undefined);
      expect(noFat.map(x => x.data.n)).toEqual(['Black bean rice']);
      expect(noFat[0]!.data.kcal).toBeGreaterThan(0);
      expect(Object.keys(diet.plan)).toHaveLength(7);
      const mealIds = new Set(diet.meals.map(m => m.id)), recipeIds = new Set(r.recipes.map(x => x.clientId));
      const items = Object.values(diet.plan).flat();
      for (const it of items) expect(it.k === 'm' ? mealIds : recipeIds).toContain(it.id);
      expect(items.some(it => it.x === 1.5)).toBe(true);
      expect(items.some(it => it.id === noFat[0]!.clientId)).toBe(false); // the tester plans it (S-191)
      // S-280 relies on this: Baked salmon is the only recipe planned on a single day.
      const days = (n: string) => Object.values(diet.plan).filter(d => d.some(it => it.k === 'r' && it.id === r.recipes.find(x => x.data.n === n)!.clientId)).length;
      expect(days('Baked salmon')).toBe(1);
      expect(days('Egg and spinach scramble')).toBe(2);
    });

    it('gives the collector three video links: the first recipe, the first exercise and one stretch', () => {
      const r = rowsOf('recipe-collector');
      expect(r.recipes[0]!.data.url).toMatch(/^https:\/\//);
      expect(r.recipes.slice(1).every(x => x.data.url === undefined)).toBe(true);
      expect(r.stretches.map(x => [x.data.n, x.data.tier])).toEqual([['Hamstring stretch', 'primary']]);
      expect(r.stretches[0]!.data.url).toMatch(/^https:\/\//);
      const withUrl = Object.entries(r.config!.ex!).filter(([, v]) => v.url);
      expect(withUrl).toHaveLength(1);
      expect(withUrl[0]![0]).toBe(EXERCISES[0]); // the first exercise passed in; in the real seed that is the first card of Program A, Day 1 (Sled push → lateral pull)
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
        if (r.config?.diet) {
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

describe('the supplement stack persona (active ingredients and split times)', () => {
  const rows = buildPersonaRows(personaById('supplement-stack')!, EXERCISES, TODAY);
  it('has fish oil at Morning and Night with omega-3, EPA and DHA rows, and a multivitamin with none', () => {
    const fish = rows.supplements.filter(x => x.data.n === 'Fish oil');
    expect(fish.map(x => x.data.slot)).toEqual(['morning', 'night']);
    expect(fish[0]!.data.ingredients!.map(i => i.name)).toEqual(['Omega-3', 'EPA', 'DHA']);
    expect(rows.supplements.find(x => x.data.n === 'Multivitamin')!.data.ingredients).toBeUndefined();
  });
  it('sets a cap on omega-3 and a target on EPA, and ticks both fish oil entries today', () => {
    expect(rows.config?.ingredientLimits).toEqual({ 'omega-3': { kind: 'cap', amount: 1500, unit: 'mg' }, epa: { kind: 'target', amount: 500, unit: 'mg' } });
    const today = rows.supplementDays.find(d => d.day === '2026-10-27')!;
    expect(Object.keys(today.taken).filter(k => k.includes('fish'))).toHaveLength(2);
  });
});

describe('the vitamin tracker persona (QA data for the vitamin and mineral features)', () => {
  const p = personaById('vitamin-tracker')!;
  const rows = buildPersonaRows(p, EXERCISES, TODAY);
  const day = '2026-10-27';
  const items = rows.supplements.map(x => normSupplementItem(x.data)!);
  const taken = Object.fromEntries(rows.supplementDays.map(d => [d.day, d.taken]));
  const eaten = normDietEntries(rows.dietEntries.map(e => e.data));

  it('writes supplements the app reads back whole, with unique ids, and ticks that name real supplements', () => {
    expect(items).toHaveLength(7);
    expect(new Set(rows.supplements.map(x => x.clientId)).size).toBe(7);
    rows.supplements.forEach(x => expect(x.data.id).toBe(x.clientId));
    expect(items.find(i => i.id.endsWith('mag-pm'))).toMatchObject({ slot: 'night', portion: 0.5, serving: { units: 2 } });
    expect(items.find(i => i.id.endsWith('fish-oil'))?.nutrients).toBeUndefined();
    for (const d of rows.supplementDays) for (const id of Object.keys(d.taken)) expect(items.some(i => i.id === id), id).toBe(true);
    expect(rows.supplementDays.map(d => d.day)).toEqual(['2026-10-27', '2026-10-26', '2026-10-25', '2026-10-24', '2026-10-22']);
  });
  it('carries amounts on most foods and none on one, and one ready-made food with amounts', () => {
    const today = eaten.filter(e => e.d === day);
    expect(today.length).toBeGreaterThanOrEqual(3);
    expect(today.map(e => [e.n, !!e.micro])).toEqual([['Oatmeal with berries', true], ['Greek yogurt', false], ['Chicken and rice bowl', true]]); // the coverage line reads 2 of 3
    const r = normRecipes(rows.recipes.map(x => x.data)).find(x => x.cat === 'ready');
    expect(r).toMatchObject({ n: 'Fortified cereal', micro: { iron: 4.5, vitaminD: 2, calcium: 130, zinc: 1.2 } });
  });
  it('sets no birth year or sex, and no other persona carries vitamin data', () => {
    expect(rows.config && 'profile' in rows.config).toBe(false);
    for (const q of PERSONAS.filter(x => x.id !== p.id && x.id !== 'supplement-stack')) {
      const r = buildPersonaRows(q, EXERCISES, TODAY);
      expect(r.supplements, q.id).toEqual([]);
      expect(r.dietEntries.some(e => e.data.micro), q.id).toBe(false);
    }
  });
});
