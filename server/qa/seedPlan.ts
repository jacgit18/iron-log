import { dietPosition } from '../../src/shared/diet.ts';
import { BUILTIN_EXERCISES } from './builtinExercises.ts';
import type { Persona } from './personas.ts';

/* ---------- What the seed script writes for one persona, as plain rows ----------
   Pure: no database, no clock (today is passed in), so a test can check every persona's counts and the script only has to insert.
   The same persona and the same day always give the same rows (a seeded generator), so a re-run puts back exactly what was there. */

export interface SeedLog { clientId: string; exerciseId: string; d: string; wk: string; phase: string; weightLb: number; setsCount: number; reps: number }
export interface SeedBody { wk: string; d: string; weightLb: number }
export interface SeedGrocery { clientId: string; position: number; data: { id: string; n: string; store: string; qty: number; cents: number | null; every: boolean; out: boolean } }
export interface SeedDiet { clientId: string; position: number; data: { id: string; d: string; n: string; kcal: number; p: number; c: number; f: number; t: number; micro?: Record<string, number> } }
export interface SeedSupplement { clientId: string; position: number; data: { id: string; n: string; slot: 'morning' | 'noon' | 'night'; dose?: string; serving?: { units: number; form: string }; nutrients?: { key: string; amount: number; unit: string }[]; ingredients?: { name: string; amount: number; unit: string }[]; portion?: number } }
export interface SeedSupplementDay { day: string; taken: Record<string, true> }
export interface SeedRecipe { clientId: string; position: number; data: { id: string; n: string; cat: string; ing: { n: string; amt: string }[]; steps: string[]; servings: number; minutes: number; kcal: number; p: number; c: number; f?: number; url?: string; pairs?: string[]; counts?: string[]; micro?: Record<string, number> } }
export interface SeedStretch { clientId: string; position: number; data: { id: string; n: string; group: string; tier: 'primary' | 'secondary' | ''; url?: string; note?: string } }
export interface PersonaRows {
  /** Stretches in the Stretches tab and the Stretch library (list 'stretch'). */
  stretches: SeedStretch[];
  dietEntries: SeedDiet[];
  supplements: SeedSupplement[];
  supplementDays: SeedSupplementDay[];
  recipes: SeedRecipe[];
  /** The config row's document, or null when the account has no settings. */
  config: { diet?: Record<string, unknown>; ex?: Record<string, { n: string; eq?: string; url?: string }>; ingredientLimits?: Record<string, { kind: 'target' | 'cap'; amount: number; unit: string }> } | null;
  logs: SeedLog[];
  body: SeedBody[];
  groceryItems: SeedGrocery[];
  groceryStores: { clientId: string; position: number; data: { id: string; n: string } }[];
  groceryGroups: { clientId: string; position: number; data: { id: string; n: string; people: { id: string; n: string }[]; stores: string[] } }[];
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
    const ready = spec.progressionReady && exerciseIds.includes(spec.progressionReady) ? spec.progressionReady : null;
    while (logs.length < spec.logEntries - (ready ? 2 : 0)) {
      const back = trainingDays[i % trainingDays.length]!;
      const d = addDays(t, -back);
      const ex = exerciseIds[Math.floor(rand() * exerciseIds.length)]!;
      logs.push({
        clientId: `qa-${persona.id}-${String(logs.length + 1).padStart(5, '0')}`,
        exerciseId: ex, d: iso(d), wk: iso(monday(d)), phase: PHASES[Math.floor(rand() * PHASES.length)]!,
        weightLb: 10 + Math.round(rand() * 40) * 5, setsCount: 2 + Math.floor(rand() * 4), reps: 6 + Math.floor(rand() * 10),
      });
      const last = logs[logs.length - 1]!;
      if (last.exerciseId === ready && last.phase === 'strength') last.phase = 'hyp'; // the ready exercise keeps only the two entries below as strength
      i++;
    }
    // Two strength sessions in a row (3 and 1 days back) at the same weight, every set at the full 4 x 6: the app then suggests going up.
    if (ready) for (const back of [3, 1]) {
      const d = addDays(t, -back);
      logs.push({ clientId: `qa-${persona.id}-${String(logs.length + 1).padStart(5, '0')}`, exerciseId: ready, d: iso(d), wk: iso(monday(d)), phase: 'strength', weightLb: 100, setsCount: 4, reps: 6 });
    }
  }
  const body: SeedBody[] = [];
  for (let w = 0; w < spec.bodyWeeks; w++) {
    const d = addDays(monday(t), -7 * w);
    body.push({ wk: iso(d), d: iso(d), weightLb: Math.round((180 - w * 0.05 + (rand() - 0.5) * 3) * 10) / 10 });
  }
  const groceryStores = spec.groceryItems > 0 ? STORES.map((n, position) => ({ clientId: n, position, data: { id: n, n } })) : [];
  const groceryGroups = spec.groceryItems > 0 && spec.groceryGroup ? [{ clientId: `qa-${persona.id}-grp`, position: 0, data: { id: `qa-${persona.id}-grp`, n: 'Home', people: [{ id: `qa-${persona.id}-sam`, n: 'Sam' }, { id: `qa-${persona.id}-alex`, n: 'Alex' }], stores: [STORES[0]!] } }] : [];
  const groceryItems: SeedGrocery[] = [];
  for (let n = 0; n < spec.groceryItems; n++) {
    const id = `qa-${persona.id}-g${String(n + 1).padStart(3, '0')}`;
    const every = rand() < 0.7;
    groceryItems.push({ clientId: id, position: n, data: { id, n: `${FOODS[n % FOODS.length]!} ${Math.floor(n / FOODS.length) + 1}`, store: STORES[n % STORES.length]!, qty: 1 + Math.floor(rand() * 3), cents: rand() < 0.75 ? 100 + Math.floor(rand() * 1500) : null, every, out: !every && rand() < 0.4 } });
  }
  const dietEntries = buildDiet(persona, t);
  const recipes = buildRecipes(persona);
  const { supplements, supplementDays } = buildVitamins(persona, t);
  return { logs, body, groceryItems, groceryStores, groceryGroups, dietEntries, supplements, supplementDays, recipes, stretches: buildStretches(persona), config: buildConfig(persona, t, recipes, exerciseIds), programs: spec.programs, erased: spec.erased === true };
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
    const micro = persona.data.vitamins ? VITAMIN_FOODS[DIET_FOODS[i]![0]] : undefined;
    out.push({ clientId: id, position: dietPosition(d), data: { id, d, n: DIET_FOODS[i]![0], kcal: Math.round(DIET_TARGETS.kcal * share), p: Math.round(DIET_TARGETS.protein * share * proteinScale), c: Math.round(DIET_TARGETS.carbs * share), f: Math.round(DIET_TARGETS.fat * share), t: DIET_FOODS[i]![2], ...(micro ? { micro: { ...micro } } : {}) } });
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

/* ---------- Vitamins and minerals (QA data for the vitamin and mineral features): the 'vitamin-tracker' persona ----------
   Amounts are chosen so the Totals sheet shows each state at once on today: Vitamin D over its 100 mcg limit (125 mcg), zinc close to its 40 mg limit (30 mg supplement + 6 mg food, food counts for zinc),
   magnesium on its supplements-only limit (200 mg from the Morning capsules; the Night intake is at half a serving and unticked), calcium and the rest well under, and B12 and fiber in the No upper limit rows.
   The foods carry amounts per entry as eaten; 'Greek yogurt' and 'Almonds and fruit' carry none, so today's coverage line reads 2 of 3 foods (today is the first three foods). */
const VITAMIN_SUPPLEMENTS: readonly SeedSupplement['data'][] = [
  { id: 'mag-am', n: 'Magnesium glycinate', slot: 'morning', serving: { units: 2, form: 'Capsule' }, nutrients: [{ key: 'magnesium', amount: 200, unit: 'mg' }] },
  { id: 'calcium', n: 'Calcium citrate', slot: 'morning', nutrients: [{ key: 'calcium', amount: 500, unit: 'mg' }] },
  { id: 'b12-fiber', n: 'B12 and fiber', slot: 'morning', nutrients: [{ key: 'vitaminB12', amount: 500, unit: 'mcg' }, { key: 'fiber', amount: 3, unit: 'g' }] },
  { id: 'd3', n: 'Vitamin D3', slot: 'noon', dose: '5000 IU', serving: { units: 1, form: 'Softgel' }, nutrients: [{ key: 'vitaminD', amount: 125, unit: 'mcg' }] },
  { id: 'zinc', n: 'Zinc picolinate', slot: 'noon', nutrients: [{ key: 'zinc', amount: 30, unit: 'mg' }] },
  { id: 'fish-oil', n: 'Fish oil', slot: 'noon' },
  { id: 'mag-pm', n: 'Magnesium glycinate', slot: 'night', serving: { units: 2, form: 'Capsule' }, nutrients: [{ key: 'magnesium', amount: 200, unit: 'mg' }], portion: 0.5 },
];
/** Which supplements were ticked, by days back from today (a day not listed has no record, so the 7-day average skips it). */
const VITAMIN_TICKS: readonly (readonly [number, readonly string[]])[] = [
  [0, ['mag-am', 'calcium', 'b12-fiber', 'd3', 'zinc', 'fish-oil']],
  [1, ['mag-am', 'mag-pm', 'calcium', 'b12-fiber', 'd3', 'zinc']],
  [2, ['mag-am', 'calcium', 'zinc']],
  [3, ['mag-am', 'mag-pm', 'd3']],
  [5, ['mag-am', 'b12-fiber']],
];
/** Vitamin and mineral amounts of each food as eaten, by name (see the note above); a food not listed carries none. */
const VITAMIN_FOODS: Readonly<Record<string, Record<string, number>>> = {
  'Oatmeal with berries': { magnesium: 60, iron: 2.5, fiber: 6, potassium: 350, calcium: 320, zinc: 1.2, vitaminB12: 0.8, sodium: 70 },
  'Chicken and rice bowl': { zinc: 4.8, magnesium: 70, niacin: 14, potassium: 600, sodium: 640, vitaminB6: 0.9 },
  'Salmon with potatoes': { vitaminD: 8, vitaminB12: 3.2, potassium: 900, sodium: 420, selenium: 45 },
};
/** The ready-made food of the vitamin persona: a Recipes card that carries amounts per serving (the same figures as the label-scan spec). */
const VITAMIN_READY_MADE = { n: 'Fortified cereal', kcal: 120, p: 3, c: 26, f: 1, micro: { iron: 4.5, vitaminD: 2, calcium: 130, zinc: 1.2 } };

/* ---------- The 'supplement-stack' persona (QA data for active ingredients, split times and the merged Manage list) ----------
   Kept apart from 'vitamin-tracker' so the walked vitamin scenarios keep their numbers. Fish oil is two entries, Morning and Night, one capsule pair each (omega-3 1,000 mg, EPA 300 mg, DHA 200 mg per serving);
   the cap is 1,500 mg omega-3 and the target 500 mg EPA. Today both fish oil entries are ticked (omega-3 2,000 mg, over its cap), creatine and caffeine are scheduled but unticked, and a multivitamin has no ingredient rows. */
const STACK_SUPPLEMENTS: readonly SeedSupplement['data'][] = [
  { id: 'fish-am', n: 'Fish oil', slot: 'morning', serving: { units: 2, form: 'Softgel' }, nutrients: [{ key: 'vitaminD', amount: 10, unit: 'mcg' }], ingredients: [{ name: 'Omega-3', amount: 1000, unit: 'mg' }, { name: 'EPA', amount: 300, unit: 'mg' }, { name: 'DHA', amount: 200, unit: 'mg' }] },
  { id: 'fish-pm', n: 'Fish oil', slot: 'night', serving: { units: 2, form: 'Softgel' }, nutrients: [{ key: 'vitaminD', amount: 10, unit: 'mcg' }], ingredients: [{ name: 'Omega-3', amount: 1000, unit: 'mg' }, { name: 'EPA', amount: 300, unit: 'mg' }, { name: 'DHA', amount: 200, unit: 'mg' }] },
  { id: 'creatine', n: 'Creatine monohydrate', slot: 'noon', serving: { units: 1, form: 'Scoop' }, ingredients: [{ name: 'Creatine', amount: 5, unit: 'g' }] },
  { id: 'caffeine', n: 'Caffeine capsule', slot: 'morning', serving: { units: 1, form: 'Capsule' }, ingredients: [{ name: 'Caffeine', amount: 200, unit: 'mg' }] },
  { id: 'multi', n: 'Multivitamin', slot: 'morning', nutrients: [{ key: 'zinc', amount: 11, unit: 'mg' }] },
];
const STACK_TICKS: readonly (readonly [number, readonly string[]])[] = [
  [0, ['fish-am', 'fish-pm', 'multi']],
  [1, ['fish-am', 'creatine', 'caffeine', 'multi']],
  [2, ['fish-am', 'fish-pm']],
];
const STACK_LIMITS = { 'omega-3': { kind: 'cap' as const, amount: 1500, unit: 'mg' }, epa: { kind: 'target' as const, amount: 500, unit: 'mg' } };

function buildVitamins(persona: Persona, today: Date): { supplements: SeedSupplement[]; supplementDays: SeedSupplementDay[] } {
  if (!persona.data.vitamins && !persona.data.supplementStack) return { supplements: [], supplementDays: [] };
  const id = (k: string) => `qa-${persona.id}-${k}`;
  const [items, ticks] = persona.data.supplementStack ? [STACK_SUPPLEMENTS, STACK_TICKS] : [VITAMIN_SUPPLEMENTS, VITAMIN_TICKS];
  const supplements = items.map((s, position): SeedSupplement => ({ clientId: id(s.id), position, data: { ...s, id: id(s.id) } }));
  const supplementDays = ticks.map(([back, ids]) => ({ day: iso(addDays(today, -back)), taken: Object.fromEntries(ids.map(k => [id(k), true as const])) }));
  return { supplements, supplementDays };
}

/** Brief qa-unblock: a recipe with calories, protein and carbs but no fat figure (S-191, the Fat bar's "n of m foods have it" line). It is not planned: the tester plans it. */
const noFatId = (persona: Persona) => `qa-${persona.id}-nofat`;
const NO_FAT_RECIPE = { n: 'Black bean rice', ing: ['Black beans', 'Rice', 'Salsa'], kcal: 420, p: 16, c: 78 };
/** Brief qa-unblock: the video links of the 'recipe-collector' persona (S-265, the Watch link on a recipe, a Board card, Stretches and the Stretch library). The ids are placeholders: tapping one opens a YouTube error page, and S-265 says so. */
const WATCH_URL = { recipe: 'https://www.youtube.com/watch?v=qa-watch-recipe', exercise: 'https://www.youtube.com/watch?v=qa-watch-exercise', stretch: 'https://www.youtube.com/watch?v=qa-watch-stretch' };

/** The app's default stretch routine (`DEFAULT_STRETCHES` in src/lib/stretches.ts, copied because server/ may import only src/shared, ADR 015; scripts/qaStretchSeed.test.ts fails when the two differ). An account with no stretch rows shows
 *  the defaults, but an account with one row shows only that row, so a persona given a stretch of its own must be given the defaults too. */
const DEFAULT_STRETCH_ROWS: SeedStretch['data'][] = [
  { id: "scarecrow", n: "Scarecrow", group: "Bands", tier: "primary", url: "https://youtu.be/qzNQ3_TQHDs" },
  { id: "v-raise", n: "V Raise", group: "Bands", tier: "primary", url: "https://youtu.be/5WBdE0TSoUQ", note: "Cross" },
  { id: "spinal-twist", n: "Supine Spinal Twist", group: "Back", tier: "primary", url: "https://www.youtube.com/watch?v=mNdJti7ZwKI" },
  { id: "reverse-plank", n: "Reverse Plank", group: "Back", tier: "primary", url: "https://youtu.be/mwaEHn2mZsE" },
  { id: "crab-position", n: "Crab Position", group: "Back", tier: "primary", url: "https://youtu.be/2AWWezRz3cI", note: "Flow into it from the reverse plank" },
  { id: "hip-switch-90", n: "90/90 Hip Switch", group: "Back", tier: "primary", url: "https://www.youtube.com/watch?v=qq_Z7sAmVrA" },
  { id: "sky-squat-reach", n: "Sky Squat Reach", group: "Squatting", tier: "primary", url: "https://www.youtube.com/watch?v=Zv1wILGzeec", note: "Or Deep Squat Band Single Arm Reach, or BJJ Hip Switch to Extension" },
  { id: "bjj-roll-up", n: "BJJ Roll Up", group: "Squatting", tier: "primary" },
  { id: "duck-walk", n: "Duck Walk", group: "Squatting", tier: "primary" },
  { id: "wall-angels", n: "Wall Angels", group: "Standing", tier: "primary", url: "https://youtu.be/ywYi4rBhRBQ" },
  { id: "shoulder-arm-circles", n: "Shoulder and Arm Circles", group: "Standing", tier: "primary" },
  { id: "up-kicks-leg-swings", n: "Up Kicks or Leg Swings", group: "Standing", tier: "primary" },
  { id: "superman-roll", n: "Grounded Superman Roll", group: "On stomach", tier: "secondary" },
  { id: "scorpion", n: "Scorpion Stretch", group: "On stomach", tier: "secondary", url: "https://youtu.be/uNDfgnWN2G0", note: "Be on the side of your face" },
  { id: "prayer-stretch", n: "Elevated Prayer Stretch", group: "Squatting", tier: "secondary", url: "https://youtu.be/c7cnNg6rBes", note: "On a bench or cube" },
  { id: "twisted-arms", n: "Twisted Arms", group: "Standing", tier: "secondary" },
  { id: "twisted-leg-reach", n: "Twisted Leg Reach", group: "Standing", tier: "secondary" },
  { id: "deep-squat-band-reach", n: "Deep Squat Band Single Arm Reach", group: "Squatting", tier: "", url: "https://youtu.be/qQCc_zulZpg" },
  { id: "bjj-hip-switch-ext", n: "BJJ Hip Switch to Extension", group: "Squatting", tier: "" },
];

function buildStretches(persona: Persona): SeedStretch[] {
  if (!persona.data.watchLinks) return [];
  const id = `qa-${persona.id}-stretch-1`;
  const all: SeedStretch['data'][] = [...DEFAULT_STRETCH_ROWS, { id, n: 'Hamstring stretch', group: 'Legs', tier: 'primary', url: WATCH_URL.stretch }];
  return all.map((data, position) => ({ clientId: data.id, position, data }));
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
  if (persona.data.watchLinks && out[0]) out[0].data.url = WATCH_URL.recipe;
  if (persona.data.noFatRecipe) {
    const id = noFatId(persona);
    out.push({ clientId: id, position: out.length, data: { id, n: NO_FAT_RECIPE.n, cat: 'protein', ing: NO_FAT_RECIPE.ing.map(n => ({ n, amt: '1 cup' })), steps: ['Prep the ingredients.', 'Cook until done.', 'Serve warm.'], servings: 2, minutes: 25, kcal: NO_FAT_RECIPE.kcal, p: NO_FAT_RECIPE.p, c: NO_FAT_RECIPE.c } });
  }
  if (persona.data.vitamins) {
    const r = VITAMIN_READY_MADE; const rid = `qa-${persona.id}-ready`;
    out.push({ clientId: rid, position: out.length, data: { id: rid, n: r.n, cat: 'ready', ing: [], steps: [], servings: 1, minutes: 0, kcal: r.kcal, p: r.p, c: r.c, f: r.f, micro: { ...r.micro } } });
  }
  return withPairing(out);
}

/** Goes with and Counts as for the accounts with enough recipes (briefs recipes-goes-with, week-board): Chicken and rice bowl and Baked salmon each go with Tuna salad (a side, so Veg), stored on both, and Lentil soup counts as Protein and Carb by hand. A QA tester then has a pairing and a hand-set Counts as to start from. */
function withPairing(list: SeedRecipe[]): SeedRecipe[] {
  const by = (n: string) => list.find(r => r.data.n === n);
  const bowl = by('Chicken and rice bowl'), salmon = by('Baked salmon'), tuna = by('Tuna salad'), soup = by('Lentil soup');
  if (!bowl || !salmon || !tuna) return list;
  const link = (a: SeedRecipe, ids: string[]) => { a.data.pairs = ids; };
  link(bowl, [tuna.data.id]); link(salmon, [tuna.data.id]); link(tuna, [bowl.data.id, salmon.data.id]);
  if (soup) soup.data.counts = ['protein', 'carb'];
  return list;
}

/** The settings document: the exercises the programs use (so the library lists them: a synced account lists only cfg.ex, ADR 024), the diet targets, saved meals and the plan (which uses the saved meals and the first recipe of each day). */
function buildConfig(persona: Persona, today: Date, recipes: SeedRecipe[], exerciseIds: readonly string[]): PersonaRows['config'] {
  const spec = persona.data;
  const diet: Record<string, unknown> = {};
  if (spec.diet?.targets) Object.assign(diet, DIET_TARGETS, { pace: 'steady' });
  const meals = MEALS.slice(0, spec.meals ?? 0).map((m, i) => ({
    id: `qa-${persona.id}-m${i + 1}`, n: m.n,
    // "Usual breakfast" is made of the account's first two recipes when it has them (each food from its recipe, same numbers), so the move into Recipes links it; every other meal is hand-typed foods and moves with its saved totals.
    items: m.n === 'Usual breakfast' && recipes.length >= 2
      ? recipes.slice(0, 2).map(r => ({ n: r.data.n, kcal: r.data.kcal, p: r.data.p, c: r.data.c, f: r.data.f, from: r.data.id }))
      : m.items.map(it => ({ n: it.n, kcal: Math.round(DIET_TARGETS.kcal * it.share), p: Math.round(DIET_TARGETS.protein * it.share), c: Math.round(DIET_TARGETS.carbs * it.share), f: Math.round(DIET_TARGETS.fat * it.share) })),
  }));
  if (meals.length) diet.meals = meals;
  const plan: Record<string, unknown[]> = {};
  const pool = recipes.filter(x => x.clientId !== noFatId(persona)); // the no-fat recipe is left unplanned for the tester to plan (S-191)
  for (let day = 0; day < (spec.planDays ?? 0); day++) {
    const items: unknown[] = [];
    if (meals.length) items.push({ k: 'm', id: meals[day % meals.length]!.id });
    const r = pool[day % Math.max(1, pool.length)];
    if (r) items.push({ k: 'r', id: r.clientId, ...(day % 3 === 1 ? { x: 1.5 } : day % 3 === 2 ? { x: 2 } : {}) });
    plan[iso(addDays(today, day))] = items;
  }
  if (Object.keys(plan).length) diet.plan = plan;
  const ex: Record<string, { n: string; eq?: string; url?: string }> = {};
  if (spec.programs) for (const id of exerciseIds) { const b = BUILTIN_EXERCISES[id]; if (b) ex[id] = b.eq ? { n: b.n, eq: b.eq } : { n: b.n }; }
  if (spec.watchLinks && exerciseIds[0] && ex[exerciseIds[0]]) ex[exerciseIds[0]]!.url = WATCH_URL.exercise; // the first exercise of Program A, Day 1: its Board card shows the Watch link
  const config: NonNullable<PersonaRows['config']> = {};
  if (Object.keys(ex).length) config.ex = ex;
  if (Object.keys(diet).length) config.diet = diet;
  if (spec.supplementStack) config.ingredientLimits = STACK_LIMITS;
  return Object.keys(config).length ? config : null;
}
