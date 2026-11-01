import { dietPosition } from '../../src/shared/diet.ts';
import type { Persona } from './personas.ts';

/* ---------- What the seed script writes for one persona, as plain rows ----------
   Pure: no database, no clock (today is passed in), so a test can check every persona's counts and the script only has to insert.
   The same persona and the same day always give the same rows (a seeded generator), so a re-run puts back exactly what was there. */

export interface SeedLog { clientId: string; exerciseId: string; d: string; wk: string; phase: string; weightLb: number; setsCount: number; reps: number }
export interface SeedBody { wk: string; d: string; weightLb: number }
export interface SeedGrocery { clientId: string; position: number; data: { id: string; n: string; store: string; qty: number; cents: number | null; every: boolean; out: boolean } }
export interface SeedDiet { clientId: string; position: number; data: { id: string; d: string; n: string; kcal: number; p: number; c: number; f: number; t: number } }
export interface SeedRecipe { clientId: string; position: number; data: { id: string; n: string; cat: string; ing: { n: string; amt: string }[]; steps: string[]; servings: number; minutes: number; kcal: number; p: number; c: number; f: number } }
export interface PersonaRows {
  dietEntries: SeedDiet[];
  recipes: SeedRecipe[];
  /** The config row's document, or null when the account has no settings. */
  config: { diet: Record<string, unknown> } | null;
  logs: SeedLog[];
  body: SeedBody[];
  groceryItems: SeedGrocery[];
  groceryStores: { clientId: string; position: number; data: { id: string; n: string } }[];
  programs: boolean;
  erased: boolean;
}

export const STORES = ['Costco', 'Trader Joe\'s', 'Farmers market', 'Corner shop'];
const FOODS = ['Eggs', 'Rice', 'Oats', 'Chicken thighs', 'Spinach', 'Bananas', 'Greek yogurt', 'Olive oil', 'Lentils', 'Salmon', 'Almonds', 'Sweet potatoes', 'Broccoli', 'Tuna', 'Milk', 'Peanut butter', 'Berries', 'Beef mince', 'Tofu', 'Cheese'];
const PHASES = ['strength', 'iso', 'hyp'];

/** The daily targets every diet persona with targets gets. */
export const DIET_TARGETS = { kcal: 2400, protein: 160, carbs: 270, fat: 70 };
/** A day's foods in eating order, each with its share of the day's targets; the first three add up to 60%. */
const DIET_FOODS: readonly [string, number, number][] = [['Oatmeal with berries', 0.25, 8], ['Greek yogurt', 0.1, 10], ['Chicken and rice bowl', 0.25, 13], ['Almonds and fruit', 0.1, 16], ['Salmon with potatoes', 0.3, 19]];
const MEALS: readonly { n: string; items: { n: string; share: number }[] }[] = [
  { n: 'Usual breakfast', items: [{ n: 'Oatmeal with berries', share: 0.2 }, { n: 'Greek yogurt', share: 0.1 }] },
  { n: 'Chicken bowl', items: [{ n: 'Chicken and rice', share: 0.25 }, { n: 'Broccoli', share: 0.03 }] },
  { n: 'Post-workout', items: [{ n: 'Protein shake', share: 0.1 }, { n: 'Banana', share: 0.05 }] },
  { n: 'Quick dinner', items: [{ n: 'Salmon', share: 0.2 }, { n: 'Sweet potatoes', share: 0.1 }, { n: 'Spinach', share: 0.02 }] },
];
const RECIPE_BASE: readonly { n: string; cat: string; ing: string[] }[] = [
  { n: 'Egg and spinach scramble', cat: 'breakfast', ing: ['Eggs', 'Spinach', 'Olive oil', 'Cheese'] },
  { n: 'Overnight oats', cat: 'breakfast', ing: ['Oats', 'Greek yogurt', 'Berries', 'Honey'] },
  { n: 'Chicken and rice bowl', cat: 'protein', ing: ['Chicken breast', 'Rice', 'Broccoli', 'Soy sauce'] },
  { n: 'Baked salmon', cat: 'protein', ing: ['Salmon', 'Sweet potatoes', 'Olive oil', 'Lemon'] },
  { n: 'Lentil soup', cat: 'protein', ing: ['Lentils', 'Carrots', 'Whole milk', 'Cumin'] },
  { n: 'Tofu stir fry', cat: 'protein', ing: ['Tofu', 'Broccoli', 'Rice', 'Ginger'] },
  { n: 'Tuna salad', cat: 'sides', ing: ['Tuna', 'Spinach', 'Olive oil', 'Red onion'] },
  { n: 'Peanut butter banana toast', cat: 'breakfast', ing: ['Peanut butter', 'Bananas', 'Bread', 'Cinnamon'] },
  { n: 'Beef and rice skillet', cat: 'protein', ing: ['Beef mince', 'Rice', 'Tomatoes', 'Garlic'] },
  { n: 'Berry yogurt bowl', cat: 'dessert', ing: ['Greek yogurt', 'Berries', 'Almonds', 'Maple syrup'] },
];

/** mulberry32: a small seeded generator. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
/** The Monday of the week holding `d` (weeks start Monday in the app's `wk`). */
const monday = (d: Date) => addDays(d, -((d.getUTCDay() + 6) % 7));

export function buildPersonaRows(persona: Persona, exerciseIds: readonly string[], today: Date): PersonaRows {
  const rand = rng(hash(persona.id));
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const spec = persona.data;
  const logs: SeedLog[] = [];
  if (spec.logEntries > 0 && exerciseIds.length) {
    // Spread the entries over the days, a few exercises on a training day, rest days in between; stop at exactly the target.
    const trainingDays: number[] = [];
    for (let back = 0; back < spec.logDays; back++) if (rand() < 0.62) trainingDays.push(back);
    if (!trainingDays.length) trainingDays.push(0);
    let i = 0;
    while (logs.length < spec.logEntries) {
      const back = trainingDays[i % trainingDays.length]!;
      const d = addDays(t, -back);
      const ex = exerciseIds[Math.floor(rand() * exerciseIds.length)]!;
      logs.push({
        clientId: `qa-${persona.id}-${String(logs.length + 1).padStart(5, '0')}`,
        exerciseId: ex, d: iso(d), wk: iso(monday(d)), phase: PHASES[Math.floor(rand() * PHASES.length)]!,
        weightLb: 10 + Math.round(rand() * 40) * 5, setsCount: 2 + Math.floor(rand() * 4), reps: 6 + Math.floor(rand() * 10),
      });
      i++;
    }
  }
  const body: SeedBody[] = [];
  for (let w = 0; w < spec.bodyWeeks; w++) {
    const d = addDays(monday(t), -7 * w);
    body.push({ wk: iso(d), d: iso(d), weightLb: Math.round((180 - w * 0.05 + (rand() - 0.5) * 3) * 10) / 10 });
  }
  const groceryStores = spec.groceryItems > 0 ? STORES.map((n, position) => ({ clientId: n, position, data: { id: n, n } })) : [];
  const groceryItems: SeedGrocery[] = [];
  for (let n = 0; n < spec.groceryItems; n++) {
    const id = `qa-${persona.id}-g${String(n + 1).padStart(3, '0')}`;
    const every = rand() < 0.7;
    groceryItems.push({ clientId: id, position: n, data: { id, n: `${FOODS[n % FOODS.length]!} ${Math.floor(n / FOODS.length) + 1}`, store: STORES[n % STORES.length]!, qty: 1 + Math.floor(rand() * 3), cents: rand() < 0.75 ? 100 + Math.floor(rand() * 1500) : null, every, out: !every && rand() < 0.4 } });
  }
  const dietEntries = buildDiet(persona, t);
  const recipes = buildRecipes(persona);
  return { logs, body, groceryItems, groceryStores, dietEntries, recipes, config: buildConfig(persona, t, recipes), programs: spec.programs, erased: spec.erased === true };
}

/** The diet log: `pastDays` full days, then today up to its share of the targets (the first foods in order, or every food scaled up when over). */
function buildDiet(persona: Persona, today: Date): SeedDiet[] {
  const diet = persona.data.diet;
  if (!diet) return [];
  const rand = rng(hash(`${persona.id}:diet`));
  const out: SeedDiet[] = [];
  const add = (day: Date, i: number, share: number, proteinScale: number) => {
    const d = iso(day);
    const id = `qa-${persona.id}-${d.replaceAll('-', '')}-${i + 1}`;
    out.push({ clientId: id, position: dietPosition(d), data: { id, d, n: DIET_FOODS[i]![0], kcal: Math.round(DIET_TARGETS.kcal * share), p: Math.round(DIET_TARGETS.protein * share * proteinScale), c: Math.round(DIET_TARGETS.carbs * share), f: Math.round(DIET_TARGETS.fat * share), t: DIET_FOODS[i]![2] } });
  };
  for (let back = diet.pastDays; back >= 1; back--) {
    const scale = 0.95 + rand() * 0.1;
    DIET_FOODS.forEach(([, share], i) => add(addDays(today, -back), i, share * scale, 1));
  }
  if (diet.todayPct > 0) {
    let sum = 0;
    DIET_FOODS.forEach(([, share], i) => {
      if (diet.todayPct <= 1 ? sum < diet.todayPct - 1e-9 : true) add(today, i, diet.todayPct > 1 ? share * diet.todayPct : share, diet.todayProteinPct);
      sum += share;
    });
  }
  return out;
}

function buildRecipes(persona: Persona): SeedRecipe[] {
  const rand = rng(hash(`${persona.id}:recipes`));
  const out: SeedRecipe[] = [];
  for (let i = 0; i < (persona.data.recipes ?? 0); i++) {
    const base = RECIPE_BASE[i % RECIPE_BASE.length]!;
    const round = Math.floor(i / RECIPE_BASE.length);
    const id = `qa-${persona.id}-r${String(i + 1).padStart(3, '0')}`;
    const servings = 1 + Math.floor(rand() * 4);
    out.push({ clientId: id, position: i, data: {
      id, n: round ? `${base.n} ${round + 1}` : base.n, cat: base.cat,
      ing: base.ing.map((n, k) => ({ n, amt: `${1 + ((i + k) % 3)} ${['cup', 'tbsp', 'piece'][(i + k) % 3]}` })),
      steps: ['Prep the ingredients.', 'Cook until done.', 'Serve warm.'], servings, minutes: 10 + Math.floor(rand() * 12) * 5,
      kcal: 250 + Math.floor(rand() * 40) * 10, p: 12 + Math.floor(rand() * 30), c: 20 + Math.floor(rand() * 50), f: 5 + Math.floor(rand() * 25),
    } });
  }
  return out;
}

/** The settings document: the diet targets, saved meals and the plan (which uses the saved meals and the first recipe of each day). */
function buildConfig(persona: Persona, today: Date, recipes: SeedRecipe[]): PersonaRows['config'] {
  const spec = persona.data;
  const diet: Record<string, unknown> = {};
  if (spec.diet?.targets) Object.assign(diet, DIET_TARGETS, { pace: 'steady' });
  const meals = MEALS.slice(0, spec.meals ?? 0).map((m, i) => ({
    id: `qa-${persona.id}-m${i + 1}`, n: m.n,
    items: m.items.map(it => ({ n: it.n, kcal: Math.round(DIET_TARGETS.kcal * it.share), p: Math.round(DIET_TARGETS.protein * it.share), c: Math.round(DIET_TARGETS.carbs * it.share), f: Math.round(DIET_TARGETS.fat * it.share) })),
  }));
  if (meals.length) diet.meals = meals;
  const plan: Record<string, unknown[]> = {};
  for (let day = 0; day < (spec.planDays ?? 0); day++) {
    const items: unknown[] = [];
    if (meals.length) items.push({ k: 'm', id: meals[day % meals.length]!.id });
    const r = recipes[day % Math.max(1, recipes.length)];
    if (r) items.push({ k: 'r', id: r.clientId, ...(day % 3 === 1 ? { x: 1.5 } : day % 3 === 2 ? { x: 2 } : {}) });
    plan[iso(addDays(today, day))] = items;
  }
  if (Object.keys(plan).length) diet.plan = plan;
  return Object.keys(diet).length ? { diet } : null;
}
